'use strict';

var WebSocket;
var lib;
module.exports = lib = {
	_inited: false,
	_instructionReceived: false,
	spectateAll: true,
	events: {},
	playerTokens: {},
	players: {},
	spectatorsAll: [],
	init: function () {
		let received = "";
		process.stdin.on('data', function onInputReceived(data) {
			received += (data.toString());
			while (received.indexOf('\n') >= 0) {
				let message = received.substring(0, received.indexOf('\n'));
				received = received.substring(received.indexOf('\n')+1);

				let object;
				try {
					object = JSON.parse(message);
				} catch (e) {
					// ?
					return;
				}

				if (missingKeys(object,'type'))
					return;

				if (object.type == 'instruction') {
					lib._instructionReceived = true;
					lib._instruction = object;
					lib._onInstructionReceived(object);
				}

				if (object.type == 'newPlayer') {
					if (missingKeys(object,'username,token'))
						return;
					if (typeof lib.playerTokens[object.username] === 'undefined')
						lib.playerTokens[object.username] = [];
					lib.playerTokens[object.username].push(object.token);
				}
			}
		});
	},
	_onInstructionReceived: function (instruction) {
		lib._inited = true;
		if (missingKeys(instruction,'wsPort,table')) {
			console.log("missing 'wsPort' or 'table' key in instruction");
			process.exit(5);
		}

		var options = {
			perMessageDeflate: {
			    zlibDeflateOptions: {
			      // See zlib defaults.
			      chunkSize: 1024,
			      memLevel: 7,
			      level: 3
			    },
			    zlibInflateOptions: {
			      chunkSize: 10 * 1024
			    },
			    // Other options settable:
			    clientNoContextTakeover: true, // Defaults to negotiated value.
			    serverNoContextTakeover: true, // Defaults to negotiated value.
			    serverMaxWindowBits: 10, // Defaults to negotiated value.
			    // Below options specified as default values.
			    concurrencyLimit: 10, // Limits zlib concurrency for perf.
			    threshold: 1024 // Size (in bytes) below which messages
			    // should not be compressed.
			}
		}
		lib.WebSocket = require('ws');
		if (instruction.ssl) {
			var fs = require('fs');
			var https = require('https');
			var server = new https.createServer({
				cert: fs.readFileSync(instruction.ssl.cert),
				key: fs.readFileSync(instruction.ssl.key)
			});
			options.server = server;
			lib._wsServer = new lib.WebSocket.Server(options);
			server.listen(instruction.wsPort);
		} else {
			options.port = instruction.wsPort
			lib._wsServer = new lib.WebSocket.Server(options);
		}
		lib._wsServer.on('connection', function onSocketConnect(socket) {
			let id = null;

			let username = null;
			let role = null;
			let player = null;
			let connected = false;
			socket.on('message', function onSocketMessage(message) {

				let object;
				try {
					object = JSON.parse(message);
				} catch (e) {
					return;
				}
				if (missingKeys(object,'type'))
					return;
				if (object.type == 'connect' && !connected) {
					if (missingKeys(object,'role') || 
						(object.role != 'spectator-all' && typeof object.username !== 'string'))
						return;
					
					username = object.username;
					role = object.role;
					if (role === 'player') {
						if (missingKeys(object,'token'))
							return;
						let token = object.token;

						if (typeof lib.playerTokens[username] === 'undefined' ||
							lib.playerTokens[username].indexOf(token) < 0) {
							socket.send(JSON.stringify({
								type: 'connect',
								status: 'err',
								errCode: 1,
								errDescription: 'token is missing'
							}));
							return;
						} else if (typeof lib.players[username] !== 'undefined') {
							var currentPlayer = lib.players[username];
							if (currentPlayer.socket.readyState != lib.WebSocket.OPEN) {
								lib._event('disconnect', [currentPlayer]);
								lib.players[username] = {};
								currentPlayer.socket.terminate();
							} else {
								socket.send(JSON.stringify({
									type: 'connect',
									status: 'err',
									errCode: 2,
									errDescription: 'player has already connected'
								}));
								return;
							}
						}

						player = {
							username,
							socket,
							spectators: [],
							_send: function (type, obj) {
								let message = JSON.stringify(Object.assign(obj,{type}));
								if (socket.readyState == 1)
									socket.send(message);
								player.spectators.forEach(s => {
									if (s.socket.readyState == 1)
										s.socket.send(message);
								});
								if (lib.spectateAll) {
									lib.spectatorsAll.forEach(s => {
										if (s.socket.readyState == 1) {
											var object = Object.assign(obj, {username});
											s.socket.send(JSON.stringify(object));
										}
									});
								}
							},
							events: [],
							_event: function (type, args) {
								for (var i = 0; i < player.events.length; ++i) {
									var event = player.events[i];
									if (Number.isInteger(event.expired) && Date.now() > event.expired) {
										player.events.splice(i, 1);
										i--;
										continue;
									}
									if (event.type == type) {
										event.function.apply(this, args);
										player.events.splice(i, 1);
										i--;
									}
								}
							},
							onOnce: function (type, func, expired) {
								player.events.push({
									type, function: func, expired
								});
							}
						}

						lib.players[username] = player;
						socket.send(JSON.stringify({type:'connect',status:'ok'}));
						lib._event('connect', [Object.assign(player, {send: function (type, obj) {
							this._send(type, obj);
						}})]);

						lib.spectatorsAll.forEach(s => {
							if (s.socket.readyState == 1) {
								s.socket.send(JSON.stringify({type:'playerConnected', username}));
							}
						});

						connected = true;
					} else if (role === 'spectator') {
						if (typeof lib.players[username] === 'undefined') {
							socket.send(JSON.stringify({
								type: 'connect',
								status: 'err',
								errCode: 3,
								errDescription: 'player is missing'
							}));
							return;
						}

						id = randomString();
						lib.players[username].spectators.push({
							id, socket
						});
					} else if (role === 'spectator-all') {
						id = randomString();
						lib.spectatorsAll.push({
							id, socket
						});
					}
				} else if (connected && role === 'player' && player && object.type !== 'connect') {
					lib._event(object.type, [Object.assign(player, {
						id: object.id,
						send: function (type, obj) {
							if (typeof this.id === 'number' &&
								Number.isInteger(this.id)) {
								obj.id = this.id;
							}
							this._send(type, obj);
						}
					}), object]);
					player._event(object.type, [Object.assign(player, {
						id: object.id,
						send: function (type, obj) {
							if (typeof this.id === 'number' &&
								Number.isInteger(this.id)) {
								obj.id = this.id;
							}
							this._send(type, obj);
						}
					}), object]);
				}
			});
			
			function onSocketClose() {
				if (connected) {
					if (role == 'player') {
						if (typeof lib.players[username] !== 'object')
							return;
						for (let spectator of lib.players[username].spectators) {
							spectator.socket.send(JSON.stringify({type:'disconnect'}));
							spectator.socket.close();
						}
						lib._event('disconnect', [lib.players[username]]);
						delete lib.players[username];

						lib.spectatorsAll.forEach(s => {
							if (s.socket.readyState == 1) {
								s.socket.send(JSON.stringify({type:'playerDisconnected', username}));
							}
						});
					} else if (role == 'spectator') {
						var index = lib.players[username].spectators.findIndex(s => s.id == id);
						if (index >= 0)
							lib.players[username].spectators.splice(index, 1);
					} else if (role == 'spectator-all') {
						var index = lib.spectatorsAll.findIndex(s => s.id == id);
						if (index >= 0)
							lib.spectatorsAll.splice(index, 1);
					}
				}
			}
			socket.on('close', onSocketClose);
			socket.on('error', onSocketClose);
		});
	},
	_event: function (eventname, args) {
		if (typeof lib.events[eventname] === 'undefined')
			return;
		let events = lib.events[eventname];
		for (let i = 0; i < events.length; ++i) {
			let handler = events[i], func = handler.function;

			if (handler.expired > 0 && handler.expired < Date.now()) {
				lib.events[eventname].splice(i, 1);
				i--;
				continue;
			}
			func.apply(this, args);
			if (handler.isOnce) {
				lib.events[eventname].splice(i, 1);
				i--;
			}
		}
	},
	_on: function (_arguments, isOnce) {
		if (_arguments.length < 2) {
			console.log("lib.on() must be executed with 2 or more arguments");
			process.exit(6);
		}
		let args = Array.prototype.slice.call(_arguments);
		let expired = -1;
		if (typeof args[args.length-1] === 'number') {
			expired = args[args.length-1]
			args.splice(args.length-1, 1);
		}

		let events = args.slice(0, args.length-1);
		let callback = args[args.length-1];

		if (typeof callback !== 'function' ||
			events.filter(event => typeof event !== 'string').length > 0) {
			console.log('lib.on() must be executed with arguments, like: (string,string,string,function) or (string,function)');
			process.exit(6);
		}

		events.forEach(event => {
			if (typeof lib.events[event] === 'undefined')
				lib.events[event] = [];
			lib.events[event].push({function: callback, once: isOnce, expired});
		});
	},
	on: function () {
		lib._on(arguments, false);
	},
	onOnce: function () {
		lib._on(arguments, true);
	},
	broadcast: function (type, message) {
		var msg = JSON.stringify(Object.assign({type}, message));
		for (var username in lib.players) {
			var player = lib.players[username];
			if (player.socket.readyState == 1)
				player.socket.send(msg)
			for (var spectator of player.spectators)
				if (spectator.socket.readyState == 1)
					spectator.socket.send(msg);
		}

		for (var spectator of lib.spectatorsAll) {
			if (spectator.socket.readyState == 1)
				spectator.socket.send(msg);
		}
	},
	broadcastToSpectatorsAll: function (type, message) {
		var msg = JSON.stringify(Object.assign({type}, message));

		for (var spectator in lib.spectatorsAll) {
			if (spectator.socket.readyState == 1)
				spectator.socket.send(msg);
		}
	}
};

function missingKeys(obj, keys) {
	if (typeof keys === 'string')
		keys = keys.split(',');
	let objKeys = Object.keys(obj);
	return keys.filter(k => objKeys.indexOf(k) < 0).length > 0;
}
function randomString(n) {
	if (typeof n === 'undefined')
		n = 16;
	let symbols = "qwertyuiopasdfghjklzxcvbnmQWERTYUIOPASDFGHJKLZXCVBNM1234567890";
	return Array.from({length: n}, () => symbols[Math.round(Math.random()*(symbols.length-1))]);
}