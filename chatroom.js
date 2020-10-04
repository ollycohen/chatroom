const database = require('./mysql.js');
// database().registerUser("username","password")
// database().loginUser("username", "password")

// Require the packages we will use:
var http = require("http");
var socketio = require("socket.io");
var fs = require("fs");
	$ = require("jquery");

const ids = {};
const rooms = ['main_room','fun_room', 'business_room'];
const owners = {};
const bans = {};
const roomToOwners = new Map();
const passwords = new Map();
const roomUsers = new Map();

// We will save the conversations in a hashmap with the rooms as keys. Rooms have no conversations to begin with.
const conversations = new Map();
for (let i = 0; i < rooms.length; i++){
	roomUsers.set(rooms[i], []);
	conversations.set(rooms[i], '');
}

// Listen for HTTP connections.  This is essentially a miniature static file server that only serves our one file, client.html:
var app = http.createServer(function(req, resp){
	// This callback runs when a new connection is made to our HTTP server.
	
	fs.readFile("client.html", function(err, data){
		// This callback runs when the client.html file has been read from the filesystem.
		
		if(err) return resp.writeHead(500);
		resp.writeHead(200);
		resp.end(data);
	});
});
app.listen(3456);

// Do the Socket.IO magic:
var io = socketio.listen(app);
io.sockets.on("connection", function(socket){
	// This callback runs when a new Socket.IO connection is established.
	socket.emit('connected', { server: 'we have connected'});
	
	socket.on('ban', function(data){
		console.log(data);
		if (data['baner'] in owners && owners[data['baner']].has(data['room'])) {
			if (data['banee'] in bans) {
				bans[data['banee']].add(data['room']);
			}
			bans[data['banee']] = new Set();
		}
	});
	
	socket.on('message_to_server', function(data) {
		// This callback runs when the server receives a new message from the client.
		
		console.log("message: "+data["message"] + ", username: " + data["username"]); // log it to the Node.JS output
		io.sockets.emit("message_to_client",{message:data["message"], username:data["username"] }) // broadcast the message to other users
	});

	// user logs in to their existing account
	socket.on('login_to_server', function(data){
		database().loginUser(data['username'], data['password'], loginResult);
	});

	// user registers a new account
	socket.on('register_to_server', function(data){
		database().registerUser(data['username'], data['password'], loginResult);
	});

	socket.on('chatroom_to_server', function(data){ 
		// This callback runs when the server gets a new chatroom from the client 
		let room = data['room'];
		conversations.set(room, '');
		rooms.push(room);
		roomUsers.set(room, []);
		addOwner(data['room']);
		// Save the owner of the room
		roomToOwners.set(data['room'], socket.username);

		console.log("new chatroom: "+data["room"]); // log it to the Node.JS output
		io.sockets.emit("chatroom_to_client", {chatroom:data["room"],password:false}) // broadcast the message to the other users
	});

	socket.on('password_room_to_server', function(data){
		// This call back runs when the client creates a new password-protected chatroom 
		let room = data['room'];
		conversations.set(room, '');
		roomUsers.set(room, []);
		passwords.set(room, data['password']);
		rooms.push(room);
		addOwner(data['room']);
		// Save the owner of the room
		roomToOwners.set(data['room'], socket.username);

		io.sockets.emit("chatroom_to_client", {chatroom:data["room"]});

	});

	socket.on('submit_password_to_server', function(data){
		let pw = data['password'];
		let room = data['room'];
		console.log("Password for " +room+": "+passwords.get(room));
		if(pw === passwords.get(room)){
			enterChatroom(room, false);
		}else{
			socket.emit('incorrect_password', {incorrect:true});
		}
	});

	// Credits: https://stackoverflow.com/questions/39880435/make-specific-socket-leave-the-room-is-in
	socket.on('kick_user', function(data){
		let user = data['user'];
		let id = ids[user];
		let sock = io.sockets.connected[id];
		let kicked = true;
		let room = 'main_room';
		enterChatroom(room, kicked, sock);
		
		
	})

	socket.on('join_server_chatroom', function(data){
		if (socket.username in bans && bans[socket.username].has(data['room'])) {
			return;
		}
		let oldConversation = data['oldConversation'];
		// Save old chatroom
		//let saved = conversations.get(socket.room);
		//saved += oldConversation;
		conversations.set(socket.room, oldConversation);

		// check if new chatroom has password
		let room = data['room'];
		if(passwords.has(room)){
			console.log("This room has a password: "+passwords.get(room));
			socket.emit('request_room_password', {room:data['room']});
		} else{
			//This callback runs when the user requests to join a chatroom
			enterChatroom(room, false);
		}
	});

	socket.on('send_pm', function(data) {
		console.log(data['recipient']);
		console.log(ids[data['recipient']]);

		io.to(`${ids[data['recipient']]}`).emit("receive_pm", {sender:socket.username, message: data['message']});
	});

	function enterChatroom(room, kicked, sock){
		if (kicked){
			socket = sock;
		}
		// Get conversation for new chat room
		let newConversation = conversations.get(room);
		socket.leave(socket.room);
		// Remove user from list of users in old room and add to new room
		// Credits: https://stackoverflow.com/questions/5767325/how-can-i-remove-a-specific-item-from-an-array
		let usersArray = roomUsers.get(socket.room);
		let index = usersArray.indexOf(socket.username);
		if(index > -1){
			usersArray.splice(index, 1);
			roomUsers.set(socket.room, usersArray);
		}
		if(!roomUsers.has(socket.username)){
			roomUsers.get(room).push(socket.username);
		}
		socket.join(room);

		let owner = roomToOwners.get(room);
		// Check if user is owner
		let isOwner;
		if(socket.username === owner){isOwner = true;}
		else{isOwner = false;}
	
		//Broadcast to old room excluding client
		socket.broadcast.to(socket.room).emit('updateChat', {username:socket.username, message:socket.username+" has left the room", updateUsers: true, owner:owner, users:roomUsers.get(socket.room)});
		//Update the room
		socket.room = room;
		// Broadcast to the new room excluding client
		socket.broadcast.to(socket.room).emit('updateChat', {username:socket.username, message:socket.username+" has joined "+socket.room, updateUsers: true, owner:owner, users:roomUsers.get(socket.room)});
		// Emit to the client that they joined the room
		socket.emit('updateChat', {username:socket.username, room:room, message:socket.username+" has joined "+room, roomchange:true, users:roomUsers.get(socket.room), isOwner:isOwner, owner:owner, conversation: newConversation});
		console.log("User: "+socket.username+" has joined chatroom: "+room);
	}
	
	function addOwner(room) {
		if (socket.username in owners) {
			owners[socket.username].add(room);
		} else {
			owners[socket.username] = new Set();
		}
	}


	function loginResult(success, username) {
		if (success){
			joinFirstTime(username);
		} else {
			socket.emit('failed_login',{});
		}
	}	

	// Inspiration taken from https://github.com/mmukhin/psitsmike_example_2/blob/master/app.js
	function joinFirstTime(username) {
		socket.username = username;
		socket.room = 'main_room';
		roomUsers.get(socket.room).push(socket.username);
		let users = roomUsers.get(socket.room);
		console.log("username: "+socket.username+" in room: "+socket.room); // log it to the Node.JS output
		ids[socket.username] = socket.id;
		socket.join('main_room');
		// Broadcast to everyone in the main room excluding the user that user has joined room.  
		socket.broadcast.to('main_room').emit('updateChat', {message:"Welcome to "+socket.room+", "+socket.username, users:users, roomchange:true});
		// Connect the user to the room
		socket.emit('username_to_client', {username:socket.username, room:socket.room, rooms:rooms, users:users});
	}

});


