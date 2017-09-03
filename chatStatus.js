const extend = require('extend')
const utilities = require('./utilities.js')
const subscriptions = require('./subscriptions.js')
const chatActions = require('./chatActions.js')
const gaap = require('./gaap.js')

let currentInteractions = []

function interactionAlerting(interactions) {
	interactions.forEach(function(n){
		console.log('chat alerting: ', n)
        var found = false;
        currentInteractions.forEach(function(curr){
            if(curr.interactionId == n.interactionId){
                extend(curr,n);
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
            chatActions.pickup(n.interactionId);
        }
    });
}

function userQueueInteractionsAdded(interactions) {
	interactions.forEach(function(change){
        var found = false
        currentInteractions.forEach(function(curr){
            if(curr.interactionId == change.interactionId) {
                extend(curr.attributes,change.attributes);
                found=true;
            }
        });
        if(!found) {
            interactions.forEach(function(i){
                currentInteractions.push(i);
                subscriptions.subscribeNewChat(i.interactionId);
            })
        }
    });
}

function userQueueInteractionsChanged(interactions) {
    interactions.forEach(function(change){
    	console.log('interaction changed: ', change)
        currentInteractions.forEach(function(curr){
            if(curr.interactionId == change.interactionId) {
                extend(curr.attributes,change.attributes);
            }
        });
    });
}

function userQueueInteractionsRemoved(interactions) {
	interactions.forEach(function(change){
		console.log('interaction removed: ', change)
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

function chatRemoveMember(membersRemoved, currentInteraction){
	console.log('removing members: ', membersRemoved)
	membersRemoved.forEach(function(change){
    	let index=-1;
        currentInteraction.members.forEach(function(mem,idx){
			if(mem.userId == change.userId) {
                index=idx;
            }
        })
        if(index > 0){
            currentInteraction.members.splice(index,1);
        }
        console.log('current members: ', currentInteraction.members)
        if(currentInteraction.members.length == 1) {
        	console.log('disconnecting interaction: ', currentInteraction.interactionId)
        	chatActions.disconnect(currentInteraction.interactionId)
        }
    })
}

function chatUpdate(interactionUpdate){
    currentInteractions.forEach(function(curr){
        if(curr.interactionId == interactionUpdate.interactionId) {
        	console.log('interaction update: ', interactionUpdate)
            if(interactionUpdate.membersAdded != undefined && interactionUpdate.membersAdded.length > 0) {
                if(curr.members == undefined) curr.members=[]
                Array.prototype.push.apply(curr.members, interactionUpdate.membersAdded)
            }
            if(interactionUpdate.membersRemoved != undefined && interactionUpdate.membersRemoved.length > 0) {
            	chatRemoveMember(interactionUpdate.membersRemoved, curr)
            }
            if(interactionUpdate.messagesAdded != undefined && interactionUpdate.messagesAdded.length > 0) {
                if(curr.messages == undefined) curr.messages=[]
                
                Array.prototype.push.apply(curr.messages, interactionUpdate.messagesAdded)

                if(interactionUpdate.messagesAdded[0].chatMember.displayName.indexOf('agent') < 0) {
                    //yo it up for testing
                    //chatbot.sendMessage(curr.interactionId, 'yo')
                    if(curr.interactionId in gaap.getGaapGuids()) {
                        gaap.sendGaap(curr.interactionId, interactionUpdate.messagesAdded[0].text)
                    } else {
                        gaap.startGaap(curr.interactionId, interactionUpdate.messagesAdded[0].chatMember.displayName)
                    }
                }
            }
        }
    })
}

module.exports = {
	interactionAlerting,
	userQueueInteractionsAdded,
	userQueueInteractionsChanged,
	userQueueInteractionsRemoved,
	chatUpdate
}
