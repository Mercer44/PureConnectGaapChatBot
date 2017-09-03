const session = require('./session.js')
const utilities = require('./utilities.js')
const subscriptions = require('./subscriptions.js')
const gaap = require('./gaap.js')

pickup = function(interactionId) {
    var icwsUser = session.getSessionUser();
    var payload = {};
    session.sendRequest('POST', '/interactions/'+interactionId+'/pickup', payload, function(status, jsonResponse) {
        if (utilities.isSuccessStatus(status)) {
            subscriptions.subscribeNewChat(interactionId);
            console.log('subscribing to new chat')
        } else {
        	console.log('failed to subscribe new chat: ', interactiondId)
        }
    });
}

sendMessage = function(interactiondId, messageValue) {
    var icwsUser = session.getSessionUser();
    var payload = {
        "clearTypingIndicator":true,
        "text":messageValue
    };
    session.sendRequest('POST', '/interactions/'+interactiondId+'/chat/messages', payload, function(status, jsonResponse) {
        if (utilities.isSuccessStatus(status)) {
            console.log('sent new message: ', messageValue)
        } else {
        	console.log('failed to send new message: ', messageValue)
        }
    });
}

disconnect = function(interactionId) {
    var icwsUser = session.getSessionUser();
    var payload = {};
    session.sendRequest('POST', '/interactions/'+interactionId+'/disconnect', payload, function(status, jsonResponse) {
        if (utilities.isSuccessStatus(status)) {
            console.log('disconnected chat: ', interactionId)
        } else {
        	 console.log('failed to disconnect chat: ', interactionId)
        }
    });
}

module.exports = {
	pickup,
	sendMessage,
	disconnect
}