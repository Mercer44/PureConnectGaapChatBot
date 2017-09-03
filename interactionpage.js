var icwsDirectUsageExample = (function (applicationExports) {
    'use strict';
    
    //
    // User configuration page implementation
    // 
    // Demonstrates IC user status subscription and modification.
    //
    applicationExports.userConfigPage = (function (exports) {
        // Element IDs used in this file.
        var USER_CONFIG_ELEMENT_ID = 'interactions-display';
        var USER_STATUS_ELEMENT_ID = 'interactions-display-go-availible';
        var CHAT_MESSAGE_ELEMENT_ID = 'interactions-display-chat-message';
        
        // Track application page state.
        var isConnected = false;
        var isShown = false;
        var userConfig;
        var currentUserStatus = 'Unknown';
        // A map from status ID to status message details.
        var statusMessages = {};
        var currentStatusId =0;
        var alertingInteractions =[];
        var currentInteractions =[];
        
        /**
         * If the application is connected and the view is shown, then update the display.
         */
        function updateUserActivationConfigIfNecessary() {
            var utilities = icwsDirectUsageExample.utilities;
            var diagnostics = icwsDirectUsageExample.diagnostics;
            var session = icwsDirectUsageExample.session;
            var uri, payload, latestCorrelationId;
            
            if (isConnected && isShown) {
                if (userConfig) {
                    updateInteractionDisplay(userConfig);
                } else {
                    // Provide contextual information for the request.
                    diagnostics.reportInformationalMessage('Retrieve logged in user configuration', 'Retrieve all configuration settings for the logged in user.');
                    
                    // ICWS configuration API retrievals utilize query parameters to specify which values should be returned.
                    uri = '/messaging/subscriptions/interaction-alerting';
                    
                    payload = {};
                    latestCorrelationId = session.sendRequest('PUT', uri, payload, function(status, jsonResponse, correlationId) {
                        // Only apply the latest result.
                        if (latestCorrelationId === correlationId) {
                            if (utilities.isSuccessStatus(status)) {
                                userConfig = jsonResponse;
                            } else {
                                userConfig = {};
                            }
                            updateInteractionDisplay(userConfig);
                        }
                    });
                }
            } else {
                // Clear the display.
                updateInteractionDisplay('');
            }
        }

        function interactionChanged(jsonMessage) {
            console.log(jsonMessage);
            jsonMessage.alertingInteractionDetails.forEach(function(n){
                var found = false;
                currentInteractions.forEach(function(curr){
                    if(curr.interactionId == n.interactionId){
                        $.extend(curr,n);
                        found = true;
                    }
                })
                if(!found){
                    currentInteractions.push({
                        "interactionId": n.interactionId,
                        attributes: {
                            "Eic_CallStateString": "Alerting",
                            "Eic_ObjectType": n.interactionType,
                            "Eic_RemoteName": n.name
                        }
                    });
                }
            });
            updateInteractionDisplay('');
        }

        /**
         * Caches the logged in user's current IC status, and starts a subscription to receive IC status changes for the logged in user.
         */
        function startUserStatusSubscription() {
            var utilities = icwsDirectUsageExample.utilities;
            var diagnostics = icwsDirectUsageExample.diagnostics;
            var session = icwsDirectUsageExample.session;
            var icwsUser, payload, userCurrentStatusElement;
            
            // Provide contextual information for the request.
            diagnostics.reportInformationalMessage('Start IC user status subscription', 'Start a subscription for IC status changes for the logged in user.');
            
            // Start listening for IC status changes for the logged in user.
            icwsUser = session.getSessionUser();
            payload = { userIds:[icwsUser] };
            session.sendRequest('PUT', '/messaging/subscriptions/status/user-statuses', payload, function(status, jsonResponse) {
                if (!utilities.isSuccessStatus(status)) {                    
                    updateInteractionDisplay('');
                }
            });
        }

        function startUserQueueSubscription() {
            var utilities = icwsDirectUsageExample.utilities;
            var diagnostics = icwsDirectUsageExample.diagnostics;
            var session = icwsDirectUsageExample.session;
            var icwsUser, payload, userCurrentStatusElement;
            
            // Provide contextual information for the request.
            diagnostics.reportInformationalMessage('Start IC user status subscription', 'Start a subscription for IC status changes for the logged in user.');
            
            // Start listening for IC status changes for the logged in user.
            icwsUser = session.getSessionUser();
            payload = {"queueIds":[{"queueType":0,"queueName":icwsUser}],"attributeNames":["Eic_CallDirection","Eic_CallStateString","Eic_CallbackAssociatedCallId","Eic_Capabilities","Eic_ConferenceId","Eic_Details","Eic_EmailAttachments","Eic_EmailChildren","Eic_EmailImportance","Eic_EmailParent","Eic_EmailSubject","Eic_IRSnippetRecordingId","Eic_ImmediateAccess","Eic_InitiationTime","Eic_MonitoredObjectId","Eic_Monitors","Eic_MonitorsSupv","Eic_Muted","Eic_ObjectType","Eic_Private","Eic_RecordedObjectId","Eic_Recorders","Eic_RecordersSupv","Eic_RecordingsAutoResumeTime","Eic_RemoteId","Eic_RemoteName","Eic_ScreenPopData","Eic_SecureRecordingPauseStartTime","Eic_State","Eic_Subject","Eic_TargetMediaType","Eic_TerminationTime","Eic_WSAnyChatUserTyping","Eic_WSLastExternalUserText","Eic_WSLastInternalUserText","Eic_WSLastTypedExternalUser","Eic_WSLastTypedInternalUser","Eic_WSLastTypedUserType","Eic_WorkgroupName","Eic_WrapUpCodeSet","Eic_WrapupConnectionSegments","is_attr_campaignid"]}
            session.sendRequest('PUT', '/messaging/subscriptions/queues/my-interactions-queue', payload, function(status, jsonResponse) {
                if (!utilities.isSuccessStatus(status)) {                    
                    updateInteractionDisplay('');
                }
            });
        }


        /**
         * User status changed message processing callback.
         * @param {Object} jsonMessage The JSON message payload.
         */
        function userStatusChanged(jsonMessage) {
            var userStatuses = jsonMessage.userStatusList;

            // This example is only subscribed to a single IC user (the logged in user) for status changes.
            currentStatusId = userStatuses[0].statusId;
            updateInteractionDisplay('');
        }

        function userQueueChanged(jsonMessage){
            console.log(jsonMessage);
            if(jsonMessage != undefined) {
                if(jsonMessage.interactionsAdded != undefined && jsonMessage.interactionsAdded.length > 0)
                {
                    jsonMessage.interactionsAdded.forEach(function(change){
                        var found = false
                        currentInteractions.forEach(function(curr){
                            if(curr.interactionId == change.interactionId) {
                                $.extend(curr.attributes,change.attributes);
                                found=true;
                            }
                        });
                        if(!found) {
                            jsonMessage.interactionsAdded.forEach(function(i){
                                currentInteractions.push(i);
                                subscribeNewChat(i.interactionId);
                            })
                        }
                    });
                    updateInteractionDisplay('');
                }
                //changed
                if(jsonMessage.interactionsChanged != undefined && jsonMessage.interactionsChanged.length > 0)
                {
                    jsonMessage.interactionsChanged.forEach(function(change){
                        currentInteractions.forEach(function(curr){
                            if(curr.interactionId == change.interactionId) {
                                $.extend(curr.attributes,change.attributes);
                            }
                        });
                    });
                }
                //removed
                if(jsonMessage.interactionsRemoved != undefined && jsonMessage.interactionsRemoved.length > 0)
                {
                    jsonMessage.interactionsRemoved.forEach(function(change){
                        var index=-1;
                        currentInteractions.forEach(function(curr, idx){
                            if(curr.interactionId == change.interactionId) {
                                index=idx;
                            }
                        });
                        if(index > 0){
                            currentInteractions.splice(index,1);
                        }
                    });
                }
            }
        }

        function userChatChange(jsonMessage){
            console.log(jsonMessage);
            if(currentInteractions != undefined && currentInteractions.length > 0){
                currentInteractions.forEach(function(curr){
                    if(curr.interactionId == jsonMessage.interactionId) {
                        if(jsonMessage.membersAdded != undefined && jsonMessage.membersAdded.length > 0) {
                            if(curr.members == undefined) curr.members=[]
                            Array.prototype.push.apply(curr.members, jsonMessage.membersAdded)
                        }
                        if(jsonMessage.messagesAdded != undefined && jsonMessage.messagesAdded.length > 0) {
                            if(curr.messages == undefined) curr.messages=[]
                            Array.prototype.push.apply(curr.messages, jsonMessage.messagesAdded)
                            if(window.chatbot.currentGuid != undefined && jsonMessage.messagesAdded[0].chatMember.displayName.indexOf('agent') < 0) {
                                sendGAAP(window.chatbot.currentGuid, jsonMessage.messagesAdded[0].text);
                            }
                        }
                    }
                })
            }
            updateInteractionDisplay('');
        }

        function getPossibleStatuses() {
            var session = icwsDirectUsageExample.session;
            var utilities = icwsDirectUsageExample.utilities;
            var icwsUser = session.getSessionUser();
            var payload = { userIds:[icwsUser] };
            var statusMessageList, i, j, statusMessage, uri, payload;
            session.sendRequest('GET', '/status/status-messages', payload, function(status, jsonResponse) {
                if (utilities.isSuccessStatus(status)) {
                    // Cache the status messages in a map, keyed by status ID.
                    statusMessageList = jsonResponse.statusMessageList;
                    for (i=0, j=statusMessageList.length; i<j; i++) {
                        statusMessage = statusMessageList[i];
                        statusMessages[statusMessage.statusId] = statusMessage;
                    }
                    
                    // Pre-load the status icons for faster display by the browser.
                    preloadStatusIcons();
                }
            });
        }

        /**
         * Pre-load the status icons for faster display by the browser.
         */
        function preloadStatusIcons() {
            var session = icwsDirectUsageExample.session;
            var icwsRootResourceUri, imagePreloader, statusMessageId, statusMessage;
            
            // The status icon URI is relative to the ICWS root URI for the server
            // that the application is connected to.
            icwsRootResourceUri = session.icwsGetRootResourceUri();
            if (icwsRootResourceUri) {
                imagePreloader = document.createElement('img');
                for (statusMessageId in statusMessages) {
                    if (statusMessages.hasOwnProperty(statusMessageId)) {
                        statusMessage = statusMessages[statusMessageId];
                        
                        // Pre-load the status icon.
                        imagePreloader.src = icwsRootResourceUri + statusMessage.iconUri;
                    }
                }
            }
        }

        function subscribeNewChat(interactionId) {
            var session = icwsDirectUsageExample.session;
            var utilities = icwsDirectUsageExample.utilities;
            var icwsUser = session.getSessionUser();
            var payload = {};
            session.sendRequest('PUT', '/messaging/subscriptions/interactions/'+interactionId+'/chat', payload, function(status, jsonResponse) {
                if (!utilities.isSuccessStatus(status)) {                    
                    updateInteractionDisplay('');
                }
            });
        }

        function activateStation(){
            var session = icwsDirectUsageExample.session;
            var utilities = icwsDirectUsageExample.utilities;
            var payload = {
            //    "supportedMediaTypes": [2],
            //    "readyForInteractions":true,
            //    "__type":"urn:inin.com:connection:stationlessSettings",
            //    "stationConnectionMode":0
            //};
                "persistentConnection":false,
                "remoteNumber":"3175226312",
                "supportedMediaTypes":[2,3],
                "stationConnectionMode":0,
                "readyForInteractions":true,
                "__type":"urn:inin.com:connection:remoteNumberSettings"
            }
            session.sendRequest('PUT', '/connection/station', payload, function(status, jsonResponse) {
                if (!utilities.isSuccessStatus(status)) {                    
                    console.log(jsonResponse);
                }
            });
        }

        window.chatbot.pickup = function(interactionId) {
            var session = icwsDirectUsageExample.session;
            var utilities = icwsDirectUsageExample.utilities;
            var icwsUser = session.getSessionUser();
            var payload = {};
            session.sendRequest('POST', '/interactions/'+interactionId+'/pickup', payload, function(status, jsonResponse) {
                if (utilities.isSuccessStatus(status)) {
                    // Cache the status messages in a map, keyed by status ID.
                    updateInteractionDisplay(jsonResponse);
                    subscribeNewChat(interactionId);
                }
            });
        }

        window.chatbot.startGaap = function(interactionId) {
            currentInteractions.forEach(function(curr){
                if(curr.interactionId == interactionId) {
                    startGAAP(interactionId, curr.members[0].displayName);
                }
            })
        }

        window.chatbot.disconnect = function(interactionId) {
            var session = icwsDirectUsageExample.session;
            var utilities = icwsDirectUsageExample.utilities;
            var icwsUser = session.getSessionUser();
            var payload = {};
            session.sendRequest('POST', '/interactions/'+interactionId+'/disconnect', payload, function(status, jsonResponse) {
                if (utilities.isSuccessStatus(status)) {
                    // Cache the status messages in a map, keyed by status ID.
                    updateInteractionDisplay(jsonResponse);
                }
            });
        }

        window.chatbot.sendMessage = function(interactiondId) {
            var messageValue = document.getElementById(CHAT_MESSAGE_ELEMENT_ID).value;
            var session = icwsDirectUsageExample.session;
            var utilities = icwsDirectUsageExample.utilities;
            var icwsUser = session.getSessionUser();
            var payload = {
                "clearTypingIndicator":true,
                "text":messageValue
            };
            session.sendRequest('POST', '/interactions/'+interactiondId+'/chat/messages', payload, function(status, jsonResponse) {
                if (utilities.isSuccessStatus(status)) {
                    // Cache the status messages in a map, keyed by status ID.
                    updateInteractionDisplay('');
                }
            });
        }

        window.chatbot.sendBotMessage = function(interactiondId, messageValue) {
            var session = icwsDirectUsageExample.session;
            var utilities = icwsDirectUsageExample.utilities;
            var icwsUser = session.getSessionUser();
            var payload = {
                "clearTypingIndicator":true,
                "text":messageValue
            };
            session.sendRequest('POST', '/interactions/'+interactiondId+'/chat/messages', payload, function(status, jsonResponse) {
                if (utilities.isSuccessStatus(status)) {
                    // Cache the status messages in a map, keyed by status ID.
                    updateInteractionDisplay('');
                }
            });
        }

        /*
        '/fish-messaging/CBPStart.jsp'
        '/fish-messaging/CBPStep.jsp'

        */

        function startGAAP(interactionId, name) {
            var newguid = guid();
            var startChatBody = {
                "auth_token": "294a46a4fb0272be57d37fd517517c1298c78f3a09dd1c9c43ff7b5fbf961a85",
                "site_id": "555",
                "is_test_call": true,
                "cli": "12347942081",
                "dnis": "8908",
                "full_session_id": newguid,
                "session_id": "pureconnect_"+newguid,
                "channel": "FACEBOOK_MESSENGER",
                "attached_data": {
                    "name": name
                }
            }
            window.chatbot.currentGuid = "pureconnect_"+newguid;
            $.ajax({
                method: "POST",
                url: "https://katemiami1-gaap.live.genesys.com/fish-messaging/CBPStart2.jsp",
                data: JSON.stringify(startChatBody),
                //contentType: "application/json;charset=utf-8",
                //dataType:"json",
                crossDomain:true//,
                //headers: {
                //    "Access-Control-Allow-Origin": "*"
                //}
            }).done(function(msg, status, rep) {
                console.log(msg);
                window.chatbot.cookies = rep.getAllResponseHeaders();
                if(msg.messages != undefined && msg.messages.length > 0) {
                    msg.messages.forEach(function(m){
                        window.chatbot.sendBotMessage(interactionId, m.text);
                    })
                }
            }).fail(function(msg) {
                console.log(msg);
            })
        }

        function sendGAAP(sessionId, message) {
            var messageBody = {
                'channel': 'FACEBOOK_MESSENGER',
                'event_details': {
                    'event_timestamp': new Date().toISOString()
                    },
                'event_type': 'MessageRecieved',
                'session_id': sessionId,
                'message_text': message
            }
            $.ajax({
                method: "POST",
                url: "https://katemiami1-gaap.live.genesys.com/fish-messaging/CBPStep.jsp",
                data: JSON.stringify(messageBody),
                crossDomain:true,
                headers: {
                    'cookies': window.chatbot.cookies
                }
                //contentType: "application/json;charset=utf-8",
                //dataType:"json"
            }).done(function(msg) {
                console.log(msg);
            }).fail(function(err) {
                console.log(err);
            })
        }

        function endGAAP(sessionId) {
            var endbody={
                'channel': 'FACEBOOK_MESSENGER',
                'event_details': {
                    'event_timestamp': new Date().toISOString()
                },
                'event_type': 'Hangup',
                'session_id': sessionId
            }

            $.ajax({
                method: "POST",
                url: "https://katemiami1-gaap.live.genesys.com/fish-messaging/CBPStep.jsp",
                data: JSON.stringify(endbody),
                crossDomain:true
            }).done(function(msg) {
                console.log(msg);
            }).fail(function(err) {
                console.log(err);
            })
        }

        function guid() {
          function s4() {
            return Math.floor((1 + Math.random()) * 0x10000)
              .toString(16)
              .substring(1);
          }
          return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
            s4() + '-' + s4() + s4() + s4();
        }
        
        
        /**
         * Updates the display with the specified text.
         * @param {Object|String} text The text to display.
         */
        function updateInteractionDisplay(text) {
            var utilities = icwsDirectUsageExample.utilities;
            var formattedMessage, userConfigElement;
            var statusMessage = statusMessages[currentStatusId];
            
            // For improved user experience, perform basic syntax highlighting of the text.
            formattedMessage = utilities.syntaxHighlight(currentInteractions);
            
            userConfigElement = document.getElementById(USER_CONFIG_ELEMENT_ID);
            var intDisplay = '';
            if(statusMessage != undefined && statusMessage.messageText != undefined) {
                intDisplay+= "Current User Status: " + statusMessage.messageText;
            }
            if(currentInteractions != undefined) {
                intDisplay+="<br/>";
                currentInteractions.forEach(function(i){
                    intDisplay+="<div>";
                    intDisplay+="Name: " + i.attributes.Eic_RemoteName + "<br/>";
                    intDisplay+="interactionId: " + i.interactionId + "<br/>";
                    intDisplay+="interactionType: " + i.attributes.Eic_ObjectType + "<br/>";
                    intDisplay+="interactionState: " + i.attributes.Eic_CallStateString + "<br/>";

                    if(i.members != undefined && i.members.length > 0) {
                        intDisplay+="Members: "
                        i.members.forEach(function(mess) {
                            intDisplay+=mess.displayName + " | ";
                        })
                        intDisplay+="<br/>";
                    }


                    if(i.messages != undefined && i.messages.length > 0) {
                        i.messages.forEach(function(mess) {
                            intDisplay+="Chat Member " + mess.chatMember.displayName + " says: " + mess.text + "<br/>";
                        });
                    }

                    if(i.attributes.Eic_CallStateString == "Alerting"){
                        intDisplay+='<input type="button" value="Pickup" data="'+i.interactionId+'" onclick="chatbot.pickup('+i.interactionId+')" /><br/>';
                    } else if(i.attributes.Eic_CallStateString == "Connected" || i.attributes.Eic_CallStateString.indexOf('Assigned') > -1) {
                        intDisplay+='Chat Message: <input type="text" id="'+CHAT_MESSAGE_ELEMENT_ID+'"/><br/><input type="button" value="Send Message" data="'+i.interactionId+'" onclick="chatbot.sendMessage('+i.interactionId+')" /><br/>';
                        intDisplay+='Start GAAP: <input type="button" value="Send Message" data="'+i.interactionId+'" onclick="chatbot.startGaap('+i.interactionId+')" /><br/>';
                    }

                    if(i.attributes.Eic_CallStateString.indexOf("Disconnected") == -1) {
                        intDisplay+='<input type="button" value="Disconnect" data="'+i.interactionId+'" onclick="chatbot.disconnect('+i.interactionId+')" /><br/>';
                    }

                    intDisplay+="</div><br/>";
                });
            }

            userConfigElement.innerHTML = intDisplay + "<br/>"+formattedMessage;
        }
        
        // Register this application page, with the page functions wired up where they are needed.
        applicationExports.applicationModel.registerApplicationPage({
            // The HTML element ID of the page, which is also used as the page ID.
            pageId: 'interactions-page',
            
            // The label under which to publish this page for selection.
            pageLabel: 'Interactions',

            // Performs one time page initialization.
            initialize: function() {
                var session = icwsDirectUsageExample.session;
            
                // Subscribe to the session model's callback mechanism for receiving ICWS messages.
                // In this case, listen to IC user status changes.
                session.registerMessageCallback('urn:inin.com:status:userStatusMessage', userStatusChanged);
                session.registerMessageCallback('urn:inin.com:queues:queueContentsMessage', userQueueChanged);
                session.registerMessageCallback('urn:inin.com:interactions:interactionAlertingMessage', interactionChanged);
                session.registerMessageCallback('urn:inin.com:interactions.chat:chatMembersMessage', userChatChange);
                session.registerMessageCallback('urn:inin.com:interactions.chat:chatContentsMessage', userChatChange);
            },

            // Called when the page is shown.
            show: function() {
                isShown = true;
                activateStation();
                updateUserActivationConfigIfNecessary();
                getPossibleStatuses();
                startUserStatusSubscription();
                startUserQueueSubscription();
            },
        
            // Called when the page is hidden.
            hide: function() {
                isShown = false;
                updateUserActivationConfigIfNecessary();
            },
            
            // Performs initialization for a new session.
            connect: function() {
                isConnected = true;
                updateUserActivationConfigIfNecessary();
            },
        
            // Performs cleanup due to a disconnected session.
            disconnect: function() {
                isConnected = false;
                userConfig = null;
                updateUserActivationConfigIfNecessary();
            }
        });

        return exports;
    } (applicationExports.userConfigPage || {}));

    return applicationExports;
} (icwsDirectUsageExample || {}));