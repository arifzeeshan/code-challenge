import { io, Socket } from 'socket.io-client';
import config from './config';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from './types/socket';

export type WaveSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export const socket: WaveSocket = io(config.SOCKET_ENDPOINT, {
  autoConnect: true,
  transports: ['websocket', 'polling'],
});
