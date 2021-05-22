import { constants } from "../util/constants.js";

export default class RoomsController {
  constructor(){}

  onNewConnection(socket){
    const { id } = socket;
    console.log('connection established with', id);
  }

  joinRoom(socket, data) {
    console.log('joinRoom', data);
    socket.emit(constants.event.USER_CONNECTED, data)
  }

  getEvents() {
    const functions = Reflect.ownKeys(RoomsController.prototype)
      .filter(fn => fn !== 'constructor')
      .map(name => [name, this[name].bind(this)]);

    return new Map(functions);
  }
}