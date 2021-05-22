import Attendee from "../entities/attendee.js";
import Room from "../entities/room.js";
import { constants } from "../util/constants.js";

export default class RoomsController {
  #users = new Map();
  constructor(){
    this.rooms = new Map();
  }

  #updateGlobalUserData(userId, userData = {}, roomId = '') {
    const user = this.#users.get(userId) ?? {};
    const existingRoom = this.rooms.has(roomId);

    const updatedUserData = new Attendee({
      ...user,
      ...userData,
      roomId, 
      //se for o único na sala
      isSpeaker: !existingRoom
    })

    this.#users.set(userId, updatedUserData);

    return this.#users.get(userId);
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

  #notifyUserProfileUpgrade(socket, roomId, user) {
    socket.to(roomId).emit(constants.event.UPGRADE_USER_PERMISSION, user);
  }

  #getNewRoomOwner(socket, room) {
    const users = [...room.users.values()];
    const activeSpeakers = users.find(user => user.isSpeaker);

    //se quem desconectou era o dono, passa a liderança para o próximo
    //se não houver speakers, ele pega o attendee mais antigo (primeira posição)
    const [ newOwner ] = activeSpeakers ? [activeSpeakers] : users;
    newOwner.isSpeaker = true;

    const outdatedUser = this.#users.get(newOwner.id);
    const udpateduser = new Attendee({
      ...outdatedUser,
      ...newOwner
    });

    this.#users.set(newOwner.id, udpateduser);

    this.#notifyUserProfileUpgrade(socket, room.id, newOwner);
    return newOwner;
  }

  #logoutUser(socket) {
    const userId = socket.id;
    const user = this.#users.get(userId);
    const roomId = user.roomId;
    //remover user da lista de usuários ativos
    this.#users.delete(userId);

    //caso seja um usário sujeira que estava em uma sala que não existe mais
    if(!this.rooms.has(roomId)){
      return;
    }

    const room = this.rooms.get(roomId);
    const toBeRemoved = [...room.users].find(({ id }) => id === userId);

    // removemos o uário da sala
    room.users.delete(toBeRemoved);

    // se não tiver mais nenhum usuário na sala, matamos a sala
    if(!room.users.size){
      this.rooms.delete(roomId);
      return
    }

    const disconnectUserWasAnOwner = userId === room.owner.id;
    const onlyOneUserLeft = room.users.size === 1;

    //validar se tem somente um usario ou se o usuario era o dono da sala

    if(onlyOneUserLeft || disconnectUserWasAnOwner){
      room.owner = this.#getNewRoomOwner(socket, room);
    }

    // atualiza a room no final
    this.rooms.set(roomId, room);
    
    // notifica a sala que o usuário se desconectou
    socket.to(roomId).emit(constants.event.USER_DISCONNECTED, user);


  }

  onNewConnection(socket){
    const { id } = socket;
    console.log('connection established with', id);

    this.#updateGlobalUserData(id)
  }

  disconnect(socket) {
    console.log('disconnect!!', socket.id);
    this.#logoutUser(socket);
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