const utilities = require('./utilities.js')
const session = require('./session.js')
const gaap = require('./gaap.js')
const chatActions = require('./chatActions.js')
const chatStatus = require('./chatStatus.js')

let userConfig
let currentStatusId=0

function updateUserActivationConfig() {
    var uri, payload, latestCorrelationId;

    // ICWS configuration API retrievals utilize query parameters to specify which values should be returned.
    uri = '/messaging/subscriptions/interaction-alerting';

    payload = {};
    session.sendRequest('PUT', uri, payload, function(status, jsonResponse, correlationId) {
        // Only apply the latest result.
        if (latestCorrelationId === correlationId) {
            if (utilities.isSuccessStatus(status)) {
                userConfig = jsonResponse;
                console.log('setting userConfig: ', userConfig)
            } else {
                userConfig = {};
            }
        }
    });
}

function interactionAlerting(jsonMessage) {
    console.log('interaction alerting!')
    console.log(jsonMessage)
    if(jsonMessage != undefined && jsonMessage.alertingInteractionDetails != undefined && jsonMessage.alertingInteractionDetails.length > 0)
        chatStatus.interactionAlerting(jsonMessage.alertingInteractionDetails)
    else
        console.log('alerting interactions were invalid: ', jsonMessage)
}

/**
 * Caches the logged in user's current IC status, and starts a subscription to receive IC status changes for the logged in user.
 */
function startUserStatusSubscription() {
    var icwsUser, payload, userCurrentStatusElement;

    // Start listening for IC status changes for the logged in user.
    icwsUser = session.getSessionUser();
    payload = { userIds:[icwsUser] };
    session.sendRequest('PUT', '/messaging/subscriptions/status/user-statuses', payload, function(status, jsonResponse) {
        if (!utilities.isSuccessStatus(status)) {
            console.log('failed to start user status subscription: ', icwsUser, status, jsonResponse)
        }
    });
}

/**
 * Starts watching the bot's queue to pickup existing interactions
 */
function startUserQueueSubscription() {
    var icwsUser, payload, userCurrentStatusElement;
    // Start listening for IC status changes for the logged in user.
    icwsUser = session.getSessionUser();
    payload = {"queueIds":[{"queueType":0,"queueName":icwsUser}],"attributeNames":["Eic_CallDirection","Eic_CallStateString","Eic_CallbackAssociatedCallId","Eic_Capabilities","Eic_ConferenceId","Eic_Details","Eic_EmailAttachments","Eic_EmailChildren","Eic_EmailImportance","Eic_EmailParent","Eic_EmailSubject","Eic_IRSnippetRecordingId","Eic_ImmediateAccess","Eic_InitiationTime","Eic_MonitoredObjectId","Eic_Monitors","Eic_MonitorsSupv","Eic_Muted","Eic_ObjectType","Eic_Private","Eic_RecordedObjectId","Eic_Recorders","Eic_RecordersSupv","Eic_RecordingsAutoResumeTime","Eic_RemoteId","Eic_RemoteName","Eic_ScreenPopData","Eic_SecureRecordingPauseStartTime","Eic_State","Eic_Subject","Eic_TargetMediaType","Eic_TerminationTime","Eic_WSAnyChatUserTyping","Eic_WSLastExternalUserText","Eic_WSLastInternalUserText","Eic_WSLastTypedExternalUser","Eic_WSLastTypedInternalUser","Eic_WSLastTypedUserType","Eic_WorkgroupName","Eic_WrapUpCodeSet","Eic_WrapupConnectionSegments","is_attr_campaignid"]}
    session.sendRequest('PUT', '/messaging/subscriptions/queues/my-interactions-queue', payload, function(status, jsonResponse) {
        if (!utilities.isSuccessStatus(status)) {
            console.log('failed to start user queue subscription: ', icwsUser, status)
        }
    });
}


/**
 * User status changed message processing callback.
 * @param {Object} jsonMessage The JSON message payload.
 */
function userStatusChanged(jsonMessage) {
    var userStatuses = jsonMessage.userStatusList;

    currentStatusId = userStatuses[0].statusId;
    console.log('current status: ' + currentStatusId)
}

/**
 * User queue changed sub to watch alerting interactions being picked up
 * @param {Object} jsonMessage The JSON message payload.
 */
function userQueueChanged(jsonMessage){
    console.log(jsonMessage);
    if(jsonMessage != undefined) {
        //added
        if(jsonMessage.interactionsAdded != undefined && jsonMessage.interactionsAdded.length > 0)
        {
            chatStatus.userQueueInteractionsAdded(jsonMessage.interactionsAdded)
        }
        //changed
        if(jsonMessage.interactionsChanged != undefined && jsonMessage.interactionsChanged.length > 0)
        {
            chatStatus.userQueueInteractionsChanged(jsonMessage.interactionsRemoved)
        }
        //removed
        if(jsonMessage.interactionsRemoved != undefined && jsonMessage.interactionsRemoved.length > 0)
        {
            chatStatus.userQueueInteractionsRemoved(jsonMessage.interactionsRemoved)
        }
    }
}

function userChatChange(jsonMessage){
    console.log('user chat change: ',jsonMessage)
    chatStatus.chatUpdate(jsonMessage)
}

function updateStatus(newStatusId){
    var icwsUser, uri, payload
    icwsUser = session.getSessionUser();
    uri = '/status/user-statuses/' + icwsUser;
    payload = { statusId: newStatusId };
    session.sendRequest('PUT', uri, payload, function() {
        console.log('updated status: ' + newStatusId)
        currentStatusId = newStatusId;
    });
}


function activateStation(){
    // TODO: I would like to be able to use stationlessSettings someday
    //{
    //    "supportedMediaTypes": [2],
    //    "readyForInteractions":true,
    //    "__type":"urn:inin.com:connection:stationlessSettings",
    //    "stationConnectionMode":0
    //};
    var payload = {
        "persistentConnection":false,
        "remoteNumber":"3175226312",
        "supportedMediaTypes":[2,3],
        "stationConnectionMode":0,
        "readyForInteractions":true,
        "__type":"urn:inin.com:connection:remoteNumberSettings"
    }
    console.log('requesting station login')
    session.sendRequest('PUT', '/connection/station', payload, function(status, jsonResponse) {
        if (!utilities.isSuccessStatus(status)) {
            console.log('failed to log into station')
            console.log(jsonResponse)
        } else {
            console.log('logged into station')
        }
    });
}

exports.getCurrentStatusId = () => {
    return Object.assign({}, currentStatusId)
}

exports.setStatusToAvailable = () => {
    updateStatus('Available')
}

exports.registerSubscriptions = () => {
    console.log('registering subscriptions')
    session.registerMessageCallback('urn:inin.com:status:userStatusMessage', userStatusChanged);
    session.registerMessageCallback('urn:inin.com:queues:queueContentsMessage', userQueueChanged);
    session.registerMessageCallback('urn:inin.com:interactions:interactionAlertingMessage', interactionAlerting);
    session.registerMessageCallback('urn:inin.com:interactions.chat:chatMembersMessage', userChatChange);
    session.registerMessageCallback('urn:inin.com:interactions.chat:chatContentsMessage', userChatChange);
    updateUserActivationConfig();
    startUserStatusSubscription();
    startUserQueueSubscription();
    activateStation();
}


exports.subscribeNewChat = (interactionId) => {
    var icwsUser = session.getSessionUser();
    var payload = {};
    session.sendRequest('PUT', '/messaging/subscriptions/interactions/'+interactionId+'/chat', payload, function(status, jsonResponse) {
        if (!utilities.isSuccessStatus(status)) {
            console.log('subscribe new chat failed: ', interactonId, status, jsonResponse)
        }
    });
}
