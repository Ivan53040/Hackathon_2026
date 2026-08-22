/**
 * net 對外入口　[擁有者：你]
 * 其他模組只 import 這裡，不要直接摸 socket.ts。
 */
export {
  createRoom, checkRoom, connect, disconnect,
  sendInput, sendCast, sendState, sendRematch,
  getRole, isHost, getLatestState, getRTT, hasPeer, isConnected,
} from './socket';
export { createRemoteOpponent } from './remoteOpponent';
