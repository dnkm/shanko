const Users = require('./libraries/user');
const Lobby = require('./libraries/lobby');
const app = require('express')();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
	pingInterval: 2000,
	pingTimeout: 5000
});

app.get('/', (req, res) => res.sendFile(__dirname + '/index.html'));

io.on('connection', (socket) => {
	console.log('user ' + socket.id + ' has connected');

	socket.use((socket, next) => {
		try {
			if (socket.length > 1 && typeof socket[1] === 'string') socket[1] = JSON.parse(socket[1]);
		} catch (err) {}
		next();
	});

	socket.on('disconnect', () => console.log('user has disconnected'));

	// user sockets
	socket.on('rqst_login', (data) => {
		console.log('rqst_login: ', data);
		Users.login(data, socket);
	});
	socket.on('rqst_userinfo', () => {
		console.log('rqst_userinfo: ', 'no params');
		Users.profile(socket);
	});
	socket.on('rqst_changegender', (data) => {
		console.log('rqst_changegender: ', data);
		Users.changeGender(data, socket);
	});
	socket.on('rqst_changeimgnumber', (data) => {
		console.log('rqst_changeimgnumber: ', data);
		Users.changeImgNumber(data, socket);
	});

	// lobby sockets
	socket.on('rqst_rooms', () => {
		console.log('rqst_rooms: ', 'no params');
		socket.emit('resp_rooms', Lobby.rooms);
	});
	socket.on('rqst_room_enter', (data) => {
		console.log('rqst_room_enter: ', data);
		Lobby.roomEnter(data, socket, io);
	});

	socket.on('rqst_room_leave', () => {
		console.log('rqst_room_leave: ', 'no params');
		Lobby.roomLeave(socket, io);
	});

	// room sockets
	socket.on('rqst_ingame_userlist', () => {
		console.log('rqst_ingame_userlist: ', 'no params');
		Lobby.getUserList(socket);
	});
	socket.on('rqst_ingame_userinfo', (data) => {
		console.log('rqst_ingame_userinfo: ', data);
		Lobby.getUserInfo(data, socket);
	});
});

http.listen(8080, () => console.log('server started'));
