const express = require('express')
const app = express()
const fs = require('fs')

const utilities = require('./utilities.js')
const session = require('./session.js')
const subscriptions = require('./subscriptions.js')
const chatActions = require('./chatActions.js')
const chatStatus = require('./chatStatus.js')

var isConnected = false;
var config = {};

connectCallback = function(success,result){
	console.log('connected? ', success)
	console.log(result)
	if(success) {
		isConnected = true;
		subscriptions.registerSubscriptions();
        console.log('finished subscriptions')
        subscriptions.setStatusToAvailable();
	}
}

disconnectCallback = function(reason){
	console.log(reason);
}

function readConfig() {
    var conf = fs.readFileSync('userConfig.json')
    config = JSON.parse(conf)
}

readConfig()
//get bot connected
session.icwsConnect("PureConnect Chat Service", config.baseUrl, config.username, config.userpass, connectCallback, disconnectCallback);

app.get('/', function (req, res) {
  res.send('Hello World!')
})

app.listen(3000, function () {
  console.log('Example app listening on port 3000!')
})
