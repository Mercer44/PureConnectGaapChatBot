const utilities = require('./utilities.js')
//const XMLHttpRequest = require('xhr2')
var xhrc = require("xmlhttprequest-cookie")
var XMLHttpRequest = xhrc.XMLHttpRequest
var CookieJar = xhrc.CookieJar
//const EventSource = require('eventsource')

//
// Credential storage
//

// Stores values for the currently connected ICWS session.
//   server The ICWS server with which the ICWS session was established.
//   userId The IC user ID that was used to login.
//   csrfToken The ICWS session's CSRF token.
//   sessionId The ICWS session's session ID.  This value must be passed in with every request.
var icwsCurrentSession = null;

// Stores the current version of messaging supported by the connected ICWS session.
// This value is used in helping to determine if short-polling or server sent events should be used for message processing.
var icwsCurrentMessagingVersion = null;

// This holds the value of the messaging version that supports server sent events.
var icwsMessagingVersionForServerSentEvents = 2;

// This holds the list of last attempted alternative switching servers.
var icwsLastAttemptedSwitchServers = [];

// This holds the list of available alternative switching servers.
var icwsAvailableSwitchServers = [];

// Stores the effective station ID for the user
var icwsEffectiveStationId = null;

/**
 * Determines whether an ICWS session is connected.
 * @returns {Boolean} true if an ICWS session is connected; otherwise, false.
 */
exports.isConnected = function() {
    // Convert the session ID to a boolean to determine if we're connected.
    return !!icwsCurrentSession;
};

/**
 * Gets the current ICWS session user, if any.
 * @returns {String} The IC user ID for the session, or null if not connected.
 */
exports.getSessionUser = function() {
    return icwsCurrentSession && icwsCurrentSession.userId;
};

/**
 * Gets the current ICWS session server, if any.
 * @returns {String} The IC server for the session, or null if not connected.
 */
exports.getSessionServer = function() {
    return icwsCurrentSession && icwsCurrentSession.server;
};

/**
 * Gets the current ICWS session ID, if any.
 * @returns {String} The ICWS session ID, or null if not connected.
 */
exports.getSessionId = function() {
    return icwsCurrentSession && icwsCurrentSession.sessionId;
};

/**
 * Gets the current effective station ID, if any.
 * @returns {String} The effective station ID, or null if not logged into a station.
 */
exports.getEffectiveStation = function() {
    return icwsEffectiveStationId && icwsEffectiveStationId.id;
};

/**
 * Stores a set of ICWS session credentials.
 * @param {String} icwsServer The server name where ICWS is available.
 * @param {String} icwsUserId The IC user ID for the session.
 * @param {String} icwsCsrfToken The ICWS CSRF token.
 * @param {String} icwsSessionId The ICWS session ID.
 */
function setCredentials(icwsServer, icwsUserId, icwsCsrfToken, icwsSessionId) {
    icwsCurrentSession = {
        server: icwsServer,
        userId: icwsUserId,
        csrfToken: icwsCsrfToken,
        sessionId: icwsSessionId
    };
}

/**
 * Clears the current ICWS session credentials, abandoning the session, if any.
 */
function clearCredentials() {
    icwsCurrentSession = null;
    icwsCurrentMessagingVersion = null;
    icwsEffectiveStationId = null;

    // Be sure to close the EventSource socket when the connection is closed.
    if (eventSource) {
        eventSource.close();
        eventSource = null;
    }
}

//
// ICWS connection
//

var sessionDisconnectCallback;

/**
 * The callback for receiving the result from {@link icwsConnect}.
 * @callback connectCallback
 * @param {Boolean} success Indicates whether the connection attempt was successful.
 * @param {Object} result If successful, an object containing ICWS session details; otherwise, an object containing error information.
 *   @param {String} result.icwsCsrfToken If successful, the ICWS CSRF token.
 *   @param {String} result.icwsSessionId If successful, the ICWS session ID.
 *   @param {Number} result.status If not successful, the http status code for the connection failure.
 *   @param {String} result.responseText If not successful, a description of the error, if available.
 * @see icwsDirectUsageExample.session.icwsConnect
 */

/**
 * The callback for receiving disconnect events from {@link icwsConnect}.
 * @callback disconnectCallback
 * @param {String} reason The reason for the disconnect.
 * @see icwsDirectUsageExample.session.icwsConnect
 */

/**
 * Attempts to create an ICWS session.
 * @param {String} application The name of the application.  This is also displayed in ININ supervisory views.
 * @param {String} server The server name where ICWS is available.
 * @param {String} user The IC user name with which to connect.
 * @param {String} password The IC password name with which to connect.
 * @param {connectCallback} connectCallback The callback to invoke with the connection result.
 * @param {disconnectCallback} [opt_disconnectCallback] For successful connections, the callback to invoke if the session is disconnected.
 * @throws {Error} The connectCallback was undefined.
 */
exports.icwsConnect = function(application, server, user, password, connectCallback, opt_disconnectCallback) {
    var payload, icwsCsrfTokenValue, icwsSessionIdValue;

    if (connectCallback === undefined) {
        throw new Error('Invalid argument "connectCallback".');
    }
    //clear list of last attempted alternative servers.
    while (icwsLastAttemptedSwitchServers.length > 0) {
        icwsLastAttemptedSwitchServers.pop();
    }
    //clear list of available alternative servers.
    while (icwsAvailableSwitchServers.length > 0) {
        icwsAvailableSwitchServers.pop();
    }
    // Cache the disconnect callback for later use.
    sessionDisconnectCallback = opt_disconnectCallback;

    payload = {
        __type: 'urn:inin.com:connection:icAuthConnectionRequestSettings',
        applicationName: application,
        userID: user,
        password: password
    };

    function reconnectToHost(hostName) {
        //Check if connected is established and the base host name match previous tried alternate host names
        if (!exports.isConnected()) {
            if (icwsLastAttemptedSwitchServers.indexOf(hostName) === -1) {
                icwsLastAttemptedSwitchServers.push(hostName);
            }
            // Perform ICWS connection attempt to alternate server.
            exports.sendSessionlessRequest(hostName, 'POST', '/connection?include=features,effective-station', payload, sendSessionlessRequestCallback);
        }
    }

    function process503StatusResponse(status, jsonResponse) {
        if (jsonResponse.alternateHostList) {
            for (var i = jsonResponse.alternateHostList.length - 1; i >= 0; i--) {
                var alternateHost = jsonResponse.alternateHostList[i];
                if (icwsAvailableSwitchServers.indexOf(alternateHost) === -1) {
                    icwsAvailableSwitchServers.push(alternateHost);
                }
            }
        }
        for (var n = icwsAvailableSwitchServers.length - 1; n >= 0; n--) {
            var availableHost = jsonResponse.alternateHostList[n];
            //Check if the available host is already attempted, if already attempted then skip reconnect
            if (icwsLastAttemptedSwitchServers.indexOf(availableHost) === -1 && availableHost.indexOf(server) === -1) {
                setTimeout(reconnectToHost(availableHost), ICWS_RECONNECT_INTERVAL_MS);
            }
        }
    }

    //Call back method
    function sendSessionlessRequestCallback(status, jsonResponse) {
        if (utilities.isSuccessStatus(status)) {
            icwsCsrfTokenValue = jsonResponse.csrfToken;
            icwsSessionIdValue = jsonResponse.sessionId;

            // Cache the supported messaging version for this ICWS session connection.
            // This is used to help determine if we can use server sent events over short-polling for message processing.
            // The features property is an array that does not guarantee index positions of features,
            //   so we need to search it for the featureId we are interested in.
            if (jsonResponse.features) {
                for (var i = jsonResponse.features.length - 1; i >= 0; i--) {
                    var featureObject = jsonResponse.features[i];

                    if (featureObject.featureId === 'messaging') {
                        icwsCurrentMessagingVersion = featureObject.version;
                        break;
                    }
                }
            }

            // Cache the effective station
            effectiveStationChanged(jsonResponse);

            // Cache the ICWS session connection information for use with future API requests.
            setCredentials(server, user, icwsCsrfTokenValue, icwsSessionIdValue);

            // Start monitoring for connection state changed messages.
            initializeConnectionMessageCallbacks();
            startMessageProcessing();

            // Signal completion of the operation, with successful results.
            connectCallback(true, {
                icwsCsrfToken: icwsCsrfTokenValue,
                icwsSessionId: icwsSessionIdValue
            });
        } else {
            // Handle 503 failures and connect to switch over server.
            if (status === 503) {
                process503StatusResponse(status, jsonResponse);
            } else {
                // Signal completion of the operation, with error details.
                connectCallback(false, {
                    status: status,
                    responseText: JSON.stringify(jsonResponse)
                });

            }
        }
    }

    // Adding the "features" value for the optional "include" query string so we can retrieve the currently supported messaging version.
    exports.sendSessionlessRequest(server, 'POST', '/connection?include=features,effective-station', payload, sendSessionlessRequestCallback);

};

/**
 * Disconnects the current ICWS session, if any, quickly to support page unload.
 * This informs the ICWS server that it can immediately reclaim resources from this application's ICWS session.
 */
exports.immediateDisconnect = function() {
    var payload;

    if (exports.isConnected()) {
        payload = '';
        exports.sendRequest('DELETE', '/connection', payload, function() {
            // Ignore log out failures.
        });
    }
};

/**
 * Disconnects the current ICWS session, if any.
 */
exports.icwsDisconnect = function() {
    var payload;

    // If there is currently an ICWS connection, then disconnect it.
    if (exports.isConnected()) {

        payload = '';
        exports.sendRequest('DELETE', '/connection', payload, function() {
            // Ignore log out failures.
        });

        // Simulate a connection state changed event.
        connectionStateChanged({
            newConnectionState: 'down',
            reason: 'User logged out.'
        });
    }
};

// Initialize an internal message callback only once.
var connectionMessageCallbacksInitialized = false;

/**
 * Initialize monitoring of connection state messages.
 */
function initializeConnectionMessageCallbacks() {
    if (!connectionMessageCallbacksInitialized) {
        // Subscribe to the session model's callback mechanism for receiving ICWS messages.
        // The session module itself handles connectionStateChanged messages, invoking the disconnectCallback passed in to icwsConnect.
        exports.registerMessageCallback('urn:inin.com:connection:connectionStateChangeMessage', connectionStateChanged);
        exports.registerMessageCallback('urn:inin.com:connection:effectiveStationChangeMessage', effectiveStationChanged);
        connectionMessageCallbacksInitialized = true;
    }
}

/**
 * Connection state changed message processing callback.
 * @param {Object} jsonMessage The JSON message payload.
 * @param {String} jsonMessage.newConnectionState The new ICWS connection state.
 * @param {String} jsonMessage.reason The reason for the change.
 */
function connectionStateChanged(jsonMessage) {
    var newConnectionState = jsonMessage.newConnectionState;

    // If the connection changes to down, and the application state shows that it is currently connection.
    if (newConnectionState === 'down') {
        if (exports.isConnected()) {
            // Stop message processing for the current ICWS session.
            stopMessageProcessing();

            // Clear the cached ICWS credentials for the current ICWS session.
            clearCredentials();

            // If there is a cached disconnect callback, invoke it.
            if (sessionDisconnectCallback) {
                sessionDisconnectCallback(jsonMessage.reason);
            }
        }
    }
}

/**
 * Effective station changed message processing callback.
 * @param {Object} jsonMessage The JSON message payload.
 * @param {Object} jsonMessage.effectiveStation.stationId The new effective station.
 */
function effectiveStationChanged(jsonMessage) {
    if (jsonMessage.effectiveStation) {
        icwsEffectiveStationId = jsonMessage.effectiveStation.stationId;
    }
}

//
// ICWS request support
//

// Constants for ICWS server access.
var ICWS_URI_SCHEME = 'https://';
var ICWS_URI_PORT = '8018';
var ICWS_URI_PATH = '/icws';
var ICWS_MEDIA_TYPE = 'application/vnd.inin.icws+JSON';
var ICWS_MEDIA_CHARSET = 'charset=utf-8';

// Timeout constant for web service requests.
var ICWS_REQUEST_TIMEOUT_MS = 60000;

/**
 * Retrieves the base URI to an ICWS server.
 * @param {String} [opt_server] The server name where ICWS is available.  Defaults to the active connection's server.
 * @returns {String} The base URI, or empty string if there is no active connection.
 */
function icwsGetRootUri(opt_server) {
    // If a server parameter was not provided, and there is an active ICWS session, use that session's server.
    if (!opt_server && exports.isConnected()) {
        opt_server = icwsCurrentSession.server;
    }

    // If an ICWS server was found, compose the URI root for that server.
    if (opt_server) {
        return ICWS_URI_SCHEME + opt_server; //+ ':' + ICWS_URI_PORT;
    }

    return '';
}

/**
 * Retrieves the base URI for an ICWS request.
 * @param {String} [opt_server] The server name where ICWS is available.
 * @returns {String} The base URI, or empty string if there is no active connection.
 */
function icwsGetRootRequestUri(opt_server) {
    // Get the base URI for the specified ICWS server.
    var uri = icwsGetRootUri(opt_server);

    // If there is a base URI, compose it with the ICWS web service path.
    if (uri) {
        return uri + ICWS_URI_PATH;
    }

    return '';
}

/**
 * Retrieves the base URI for a request for a non-ICWS resource.
 * @returns {String} The base URI, or empty string if there is no active connection.
 */
exports.icwsGetRootResourceUri = function() {
    return icwsGetRootUri();
};

/**
 * The callback for receiving the result from {@link sendRequest} or {@link sendSessionlessRequest}.
 * @callback resultCallback
 * @param {Number} status The HTTP status code of the response.
 * @param {Object} jsonResponse The JSON response payload.
 * @param {String} correlationId A correlation ID to associate diagnostic messages.
 * @param {String} sessionId The ICWS session ID.
 * @see icwsDirectUsageExample.session.sendRequest
 * @see icwsDirectUsageExample.session.sendSessionlessRequest
 */

/**
 * Sends a request that doesn't require an active ICWS session.
 * @param {String} server The server name where ICWS is available.
 * @param {String} method The HTTP method of the request. (ex: GET, POST, PUT, DELETE)
 * @param {String} requestPath The uri fragment for the request.  The part after the sessionId template parameter.  (ex: /messaging/messages)
 * @param {Object|String} payload The payload to send with the request, as a string or JSON.
 * @param {resultCallback} resultCallback The callback to invoke with the response details.
 * @returns {Number} The correlation ID of the request, to support synchronization with the value passed to resultCallback.
 * @see icwsDirectUsageExample.session.sendRequest
 * @throws {Error} The resultCallback was undefined.
 */
exports.sendSessionlessRequest = function(server, method, requestPath, payload, resultCallback) {
    console.log('sending sessionless xhr: ' + requestPath)
    return sendRequestImpl(server, method, requestPath, payload, resultCallback, true);
};

/**
 * Sends a request to an existing ICWS session.
 * @param {String} method The HTTP method of the request. (ex: GET, POST, PUT, DELETE)
 * @param {String} requestPath The uri fragment for the request.  The part after the sessionId template parameter.  (ex: /messaging/messages)
 * @param {Object|String} payload The payload to send with the request, as a string or JSON.
 * @param {resultCallback} resultCallback The callback to invoke with the response details.  If there is no existing session, the callback will be invoked with a 0 status and empty object.
 * @returns {Number} The correlation ID of the request, to support synchronization with the value passed to resultCallback, or null if there is no connected session.
 * @see icwsDirectUsageExample.session.sendSessionlessRequest
 * @throws {Error} The resultCallback was undefined.
 */
exports.sendRequest = function(method, requestPath, payload, resultCallback) {
    console.log('sending authed xhr: ' + requestPath)
    if (exports.isConnected()) {
        return sendRequestImpl(icwsCurrentSession.server, method, requestPath, payload, resultCallback, false);
    } else {
        return null;
    }
};

// For application diagnostic purposes, track a numeric correlation ID to associate requests with responses.
var nextCorrelationId = 1;

/**
 * Implementation for sending a request to ICWS.
 * @param {String} server The server name where ICWS is available.
 * @param {String} method The HTTP method of the request. (ex: GET, POST, PUT, DELETE)
 * @param {String} requestPath The uri fragment for the request.  The part after the sessionId template parameter.  (ex: /messaging/messages)
 * @param {Object|String} payload The payload to send with the request, as a string or JSON.
 * @param {resultCallback} resultCallback The callback to invoke with the response details.
 * @param {Boolean} [opt_excludeSessionId=false] Specifies whether to exclude the existing session ID from the request (i.e. whether to send a sessionless request).
 * @returns {Number} The correlation ID of the request, to support synchronization with the value passed to resultCallback.
 * @throws {Error} The resultCallback was undefined.
 */
function sendRequestImpl(server, method, requestPath, payload, resultCallback, opt_excludeSessionId) {
    var correlationId, sessionId, xmlHttp, uri, diagnosticValue;

    if (resultCallback === undefined) {
        throw new Error('Invalid argument "resultCallback".');
    }

    // Allow JSON to be provided as an option, then convert it to a string.
    if (typeof payload !== 'string' && !(payload instanceof String)) {
        payload = JSON.stringify(payload);
    }

    // For application diagnostic purposes, track a numeric correlation ID to associate requests with responses.
    correlationId = nextCorrelationId++;
    sessionId = '0';
    // Once a session has been established, subsequent requests for that session require its session ID.
    if (!opt_excludeSessionId) {
        sessionId = icwsCurrentSession.sessionId;
        console.log('adding sessiondID: ' + sessionId)
    }

    // Use an XHR to make the web service request.
    xmlHttp = new XMLHttpRequest();

    // Once it's available, process the request response.
    xmlHttp.onreadystatechange = function() {
        if (xmlHttp.readyState === 4) {
            sendRequestCompleted(xmlHttp, sessionId, correlationId, resultCallback);
        }
    };

    // Create the base URI, using the ICWS port, with the specified server and session ID.
    // This helper function abstracts away the details.
    uri = icwsGetRootRequestUri(server);
    // Once a session has been established, subsequent requests for that session require its session ID.
    if (!opt_excludeSessionId) {
        uri += '/' + sessionId;
    }
    // Add the specific ICWS request to the URI being built.
    if (requestPath.substring(0, 1) !== '/') {
        uri += '/';
    }
    uri += requestPath;

    // Open the HTTP connection.
    xmlHttp.open(method, uri, true);

    // Specify that credentials should be used for the request, in order to work correctly with CORS.
    xmlHttp.withCredentials = true;

    xmlHttp.timeout = ICWS_REQUEST_TIMEOUT_MS;

    // If the ICWS request is a session-based request, then the session's CSRF token must be set as
    // a header parameter.
    if (!opt_excludeSessionId) {
        xmlHttp.setRequestHeader('ININ-ICWS-CSRF-Token', icwsCurrentSession.csrfToken);
        console.log('adding crsf token: ')
        //console.log(icwsCurrentSession)
    }
    // set accept type
    xmlHttp.setRequestHeader('Accept-Language', 'application/json')

    // The ICWS content-type must be specified.
    xmlHttp.setRequestHeader('Content-type', ICWS_MEDIA_TYPE + ';' + ICWS_MEDIA_CHARSET);

    //console.log(xmlHttp)
    // Send the request.
    xmlHttp.send(payload);

    if (payload !== undefined && payload !== null && payload !== '') {
        try {
            diagnosticValue = JSON.parse(payload);
        } catch (e) {
            /* Use payload as the diagnosticValue. */
            diagnosticValue = '[invalid JSON] ' + payload;
        }
    }

    return correlationId;
}

/**
 * Process the response to an ICWS request.
 * @param {Object} xmlHttp The XMLHttpRequest instance for the request.
 * @param {String} sessionId The session ID that was used, if any, for diagnostic purposes.
 * @param {Number} correlationId The correlation ID of the request, for diagnostic purposes.
 * @param {resultCallback} resultCallback The callback to invoke with the result.
 */
function sendRequestCompleted(xmlHttp, sessionId, correlationId, resultCallback) {
    var status, responseText, response, diagnosticResponseValue;

    status = xmlHttp.status;

    // Handle 401 failures as server disconnects.
    if (status === 401) {
        console.log('status was 401 ')
        connectionStateChanged({
            newConnectionState: 'down',
            reason: 'No connection to server.'
        });
    }

    // Process the response body.
    responseText = xmlHttp.responseText;
    if (responseText) {
        try {
            response = JSON.parse(responseText);
            diagnosticResponseValue = response;
        } catch (e) {
            /* If the JSON cannot be parsed, use responseText as the diagnosticResponseValue and an empty object for response. */
            response = {};
            diagnosticResponseValue = '[invalid JSON] ' + responseText;
        }
    } else {
        diagnosticResponseValue = response = {};
    }

    // Signal the request result to the caller's callback.
    resultCallback(status, response, correlationId, sessionId);
}

//
// ICWS messaging support
//

// Dictionary of ICWS message __type ID to the callback (type: icwsMessageCallback) to invoke when that message is received.
var icwsMessageCallbacks = {};
// Optional callback for processing unhandled ICWS messages.
// Type: icwsMessageCallback
var icwsUnhandledMessageCallback = null;
// Timer for when short-polling is used.
var messageProcessingTimerId;
// EventSource object for when Server Sent Events is used.
var eventSource;

// Polling interval for retrieving ICWS message queue.
var ICWS_MESSAGE_RETRIEVAL_INTERVAL_MS = 1000;

// Reconnect interval for establish a connection with alternate swith over server.
var ICWS_RECONNECT_INTERVAL_MS = 15000;

/**
 * The callback for receiving messages due to using {@link registerMessageCallback}.
 * @callback icwsMessageCallback
 * @param {Object} jsonMessage The JSON message payload.
 * @see icwsDirectUsageExample.session.registerMessageCallback
 */

/**
 * Sets the callback for a particular type of ICWS message.
 * @param {String} messageType The ICWS message type. (ex: urn:inin.com:status:userStatusMessage)
 * @param {icwsMessageCallback} messageCallback The callback to invoke with the message details.
 * @throws {Error} The messageCallback was undefined.
 * @throws {Error} A callback is already registered for the specified messageType.
 */
exports.registerMessageCallback = function(messageType, messageCallback) {
    if (messageCallback === undefined) {
        throw new Error('Invalid argument "messageCallback".');
    }

    if (!icwsMessageCallbacks[messageType]) {
        icwsMessageCallbacks[messageType] = messageCallback;
    } else {
        throw new Error('Message callback already registered for message type: ' + messageType);
    }
};

/**
 * Sets the callback for unhandled ICWS messages.
 * @param {icwsMessageCallback} messageCallback The callback to invoke with the message details.
 * @throws {Error} The messageCallback was undefined.
 * @throws {Error} A callback is already registered for unhandled messages.
 */
exports.registerUnhandledMessageCallback = function(messageCallback) {
    if (messageCallback === undefined) {
        throw new Error('Invalid argument "messageCallback".');
    }

    if (!icwsUnhandledMessageCallback) {
        icwsUnhandledMessageCallback = messageCallback;
    } else {
        throw new Error('Message callback already registered for unhandled messages.');
    }
};

/**
 * Starts the message processing mechanism, if not already running.
 * @see stopMessageProcessing
 */
function startMessageProcessing() {
    // Check to see if the browser being used supports EventSource, and check
    // if the connected ICWS session supports server sent events.  If they are
    // both supported, then we will elect to use the message processing for
    // server sent events instead of short-polling.
    if (typeof EventSource !== 'undefined' &&
        icwsCurrentMessagingVersion >= icwsMessagingVersionForServerSentEvents) {
        console.log('starting sse polling')
        startServerSentEventsMessageProcessing();
    } else {
        console.log('starting short polling')
        startShortPollingMessageProcessing();
    }
}

/**
 * Starts the message processing mechanism for server sent events, if not already running.
 * @see stopMessageProcessing
 * @see startMessageProcessing
 */
function startServerSentEventsMessageProcessing() {
    if (!eventSource) {
        var messagesUrl = icwsGetRootRequestUri(icwsCurrentSession.server) + '/' + icwsCurrentSession.sessionId + '/messaging/messages';

        eventSource = new EventSource(messagesUrl, {
            withCredentials: true
        });

        // Add in some event handlers to display the status of the EventSource socket.
        eventSource.onopen = function() {

        };
        eventSource.onerror = function() {
            var status;

            switch (eventSource.readyState) {
                case EventSource.CONNECTING:
                    status = 'EventSource socket is reconnecting.';
                    break;
                case EventSource.CLOSED:
                    status = 'EventSource socket was closed.';
                    break;
            }

            
        };

        eventSource.addEventListener('message', function(e) {
           
            var message = JSON.parse(e.data);
            processMessage(message);
        });
    }
}

/**
 * Starts the message processing mechanism for short-polling, if not already running.
 * @see stopMessageProcessing
 * @see startMessageProcessing
 */
function startShortPollingMessageProcessing() {
    // Only send the next request once the previous result has been received.
    function runTimerInstance() {
        messageProcessingTimerCallback();

        messageProcessingTimerId = setTimeout(runTimerInstance, ICWS_MESSAGE_RETRIEVAL_INTERVAL_MS);
    }

    if (!messageProcessingTimerId) {
        runTimerInstance();
    }
}

/**
 * Stops the message processing mechanism, if running.
 * @see startMessageProcessing
 */
function stopMessageProcessing() {
    // Call the appropriate stop based on if we used server sent events or short-polling.
    if (eventSource) {
        stopServerSentEventsMessageProcessing();
    } else {
        stopShortPollingMessageProcessing();
    }
}

/**
 * Stops the message processing mechanism for server sent events, if running.
 * @see startMessageProcessing
 * @see stopMessageProcessing
 */
function stopServerSentEventsMessageProcessing() {
    if (!!eventSource) {
        eventSource.close();
        eventSource = null;
    }
}

/**
 * Stops the message processing mechanism for short-polling, if running.
 * @see startMessageProcessing
 * @see stopMessageProcessing
 */
function stopShortPollingMessageProcessing() {
    if (!!messageProcessingTimerId) {
        clearTimeout(messageProcessingTimerId);
        messageProcessingTimerId = null;
    }
}

/**
 * Implements the message processing mechanism timer callback.
 * @see startMessageProcessing
 * @see stopMessageProcessing
 */
function messageProcessingTimerCallback() {
    var currentSessionId, payload, messageIndex, messageCount;

    currentSessionId = icwsCurrentSession.sessionId;

    payload = {};
    exports.sendRequest('GET', '/messaging/messages', payload, function(status, jsonResponse, correlationId, sessionId) {
        // Ignore results for an older session.
        if (currentSessionId === sessionId) {
            if (utilities.isSuccessStatus(status)) {
                // Process retrieved messages.
                for (messageIndex = 0, messageCount = jsonResponse.length; messageIndex < messageCount; messageIndex++) {
                    processMessage(jsonResponse[messageIndex]);
                }
            }
        }
    });
}

/**
 * Calls the registered callback for a message received from the server.
 * @see startMessageProcessing
 * @see stopMessageProcessing
 */
function processMessage(jsonMessage) {
    var messageType, messageCallback;
    messageType = jsonMessage.__type;

    // For each message, invoke a registered message callback if there is one;
    // otherwise, invoke the unhandled message callback.
    messageCallback = icwsMessageCallbacks[messageType];
    if (messageCallback) {
        messageCallback(jsonMessage);
    } else if (icwsUnhandledMessageCallback !== null) {
        icwsUnhandledMessageCallback(jsonMessage);
    }
}

return exports;
