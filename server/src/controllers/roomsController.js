import Attendee from "../entities/attendee.js";
import Room from "../entities/room.js";
import { constants } from "../util/constants.js";

export default class RoomsController {
  #user = new Map();
  constructor(){
    this.rooms = new Map();
  }

  #updateGlobalUserData(userId, userData = {}, roomId = '') {
    const user = this.#user.get(userId) ?? {};
    const existingRoom = this.rooms.has(roomId);

    const updatedUserData = new Attendee({
      ...user,
      ...userData,
      roomId, 
      //se for o único na sala
      isSpeaker: !existingRoom
    })

    this.#user.set(userId, updatedUserData);

    return this.#user.get(userId);
  }

  #mapRoom(room) {
    const users = [...room.users.values()];
    const speakersCount = users.filter(user => user.isSpeaker).length;
    const featuredAttendees = users.slice(0, 3);
    const mappedRoom = new Room({
      ...room,
      featuredAttendees,
      speakersCount,
      attendeesCount: room.users.size,
    })

    return mappedRoom;
  }

  #replyWithActiveUsers(socket, users){
    const event = constants.event.LOBBY_UPDATED;

    socket.emit(event, [...users.values()]);
  }

  #notifyUsersOnRoom(socket, roomId, user){
    const event = constants.event.USER_CONNECTED;
    socket.to(roomId).emit(event, user);
  }
  
  #joinUserRoom(socket, user, room) {
    const roomId = room.id;
    const existingRoom = this.rooms.has(roomId);
    const currentRoom = existingRoom ? this.rooms.get(roomId) : {};
    const currentUser = new Attendee({
      ...user,
      roomId,
    })

    // definir dono da sala
    const [owner, users] = existingRoom ?
      [ currentRoom.owner, currentRoom.users ] :
      [ currentUser, new Set() ]

    const updatedRoom = this.#mapRoom({
      ...currentRoom,
      ...room,
      owner,
      users: new Set([...users, ...[currentUser]])
    })

    this.rooms.set(roomId, updatedRoom);

    socket.join(roomId);

    return this.rooms.get(roomId);
  }

  

  onNewConnection(socket){
    const { id } = socket;
    console.log('connection established with', id);

    this.#updateGlobalUserData(id)
  }

  joinRoom(socket, { user, room}) {
    console.log('joinRoom');

    const userId = user.id = socket.id;
    const roomId = room.id;

    const updatedUserData = this.#updateGlobalUserData(
      userId, 
      user, 
      roomId
    );

    const updatedRoom = this.#joinUserRoom(socket, updatedUserData, room);

    console.log(updatedRoom);

    // socket.emit(constants.event.USER_CONNECTED, updatedUserData)
    this.#notifyUsersOnRoom(socket, roomId, updatedUserData);
    this.#replyWithActiveUsers(socket, updatedRoom.users)
  }

  getEvents() {
    const functions = Reflect.ownKeys(RoomsController.prototype)
      .filter(fn => fn !== 'constructor')
      .map(name => [name, this[name].bind(this)]);

    return new Map(functions);
  }
}