const request = require('request')
const uuidv1 = require('uuid/v1')
const fs = require('fs')

const chatActions = require('./chatActions.js')

var config = {};
var gaapGuids = {};
var gaapCookieJars = {};
var debug = true;

function readConfig() {
	var conf = fs.readFileSync('gaapConfig.json')
	config = JSON.parse(conf)
}

function getGaapGuids() {
	return Object.assign({}, gaapGuids)
}

function handleGappMessages(interactionId, body){
	if(body.messages != undefined && body.messages.length > 0) {
		var newmessages = body.messages.sort(function(a,b){return new Date(b.date) - new Date(a.date);})
		body.messages.forEach(function(m){
			chatActions.sendMessage(interactionId, m.text);
		})
	}
}

function startGaap(interactionId, name) {
	console.log('starting gaap convo: ' + interactionId)
    var newguid = uuidv1()
    var startChatBody = {
        "auth_token": config.auth_token,
        "site_id": config.site_id,
        "is_test_call": config.is_test_call,
        "cli": "12347942081",
        "dnis": "8908",
        "full_session_id": newguid,
        "session_id": "pureconnect_"+newguid,
        //"channel": "WEB"
        "channel": "FACEBOOK_MESSENGER",
        "attached_data": {
            "name": name
        }
    }
    gaapGuids[interactionId] = "pureconnect_"+newguid;
    gaapCookieJars[interactionId] = request.jar()
    console.log(startChatBody);
    var options = {
	  method: 'post',
	  body: startChatBody,
	  json: true,
	  jar: gaapCookieJars[interactionId],
	  url: config.baseUrl + '/fish-messaging/CBPStart.jsp'
	}
    request(options, function (err, res, body) {
		if (err) {
			console.error('error posting json: ', err)
			throw err
		}
		/*var headers = res.headers
		var statusCode = res.statusCode
		console.log('headers: ', headers)
		console.log('statusCode: ', statusCode)
		
		console.log('cookies: ', gaapCookieJars[interactionId])*/
		console.log('body: ', body)
		handleGappMessages(interactionId, body)
		
	})
}

function sendGaap(interactionId, message) {
	console.log("adding gaap message:"+ message)
    var messageBody = {
        'channel': 'FACEBOOK_MESSENGER',
        'event_details': {
            'event_timestamp': new Date().toISOString()
            },
        'event_type': 'MessageRecieved',
        'session_id': gaapGuids[interactionId],
        'message_text': message
    }

    var options = {
	  method: 'post',
	  body: messageBody,
	  json: true,
	  jar: gaapCookieJars[interactionId],
	  url: config.baseUrl + '/fish-messaging/CBPStep.jsp'
	}
	console.log(options)
    request(options, function (err, res, body) {
		if (err) {
			console.error('error posting json: ', err)
			throw err
		}
		
		var headers = res.headers
		var statusCode = res.statusCode
		console.log('headers: ', headers)
		console.log('statusCode: ', statusCode)
		console.log('body: ', body)
		
		handleGappMessages(interactionId, body)
	})
}

function endGaap(sessionId) {
    var endbody={
        'channel': 'FACEBOOK_MESSENGER',
        'event_details': {
            'event_timestamp': new Date().toISOString()
        },
        'event_type': 'Hangup',
        'session_id': sessionId
    }
    var options = {
	  method: 'post',
	  body: endbody,
	  json: true,
	  jar: gaapCookieJars[interactionId],
	  url: config.baseUrl + '/fish-messaging/CBPStep.jsp'
	}
    request(options, function (err, res, body) {
		if (err) {
			console.error('error posting json: ', err)
			throw err
		}
		var headers = res.headers
		var statusCode = res.statusCode
		console.log('headers: ', headers)
		console.log('statusCode: ', statusCode)
		console.log('body: ', body)
		console.log('cookies: ', gaapCookieJars[interactionId])
		console.log('ended convo')
	})
}

readConfig();

module.exports ={
	getGaapGuids,
	startGaap,
	sendGaap,
	endGaap
}