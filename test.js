import { check } from "k6";
import ws from "k6/ws";

// Environment config
const token = __ENV.SUPABASE_KEY;
const socketURI = `wss://${__ENV.HOSTNAME}/realtime/v1/websocket`;
const conns = __ENV.CONNS || 1;
const instances = __ENV.INSTANCES ? parseInt(__ENV.INSTANCES) : 1;
const rate = __ENV.RATE ? parseInt(__ENV.RATE) : 10;
const roomNumber = __ENV.ROOMS ? parseInt(__ENV.ROOMS) : 20;
const baseDuration = __ENV.DURATION || 120;
const duration = parseInt(baseDuration) + 60;

// Generate room names
const rooms = Array.from({ length: roomNumber }, (_, i) => `channel_${i}`);

// Ramp up from 0 to 10000 virtual users, then sustain, then ramp down
// export const options = {
//   stages: [
//     { duration: '2m', target: 1000 },
//     { duration: '2m', target: 3000 },
//     { duration: '3m', target: 6000 },
//     { duration: '4m', target: 10000 },
//     { duration: '3m', target: 10000 },
//     { duration: '2m', target: 0 },
//   ],
//   // thresholds: {
//   //   checks: ['rate>0.95'], // Ensure 95% of checks pass
//   // },
// };

export const options = {
  stages: [
    { duration: '2m', target: 2000 },
    { duration: '2m', target: 4000 },
    // { duration: '2m', target: 6000 },
    // { duration: '2m', target: 8000 },
    { duration: '3m', target: 5000 },
    { duration: '3m', target: 0 },
  ],
  // thresholds: {
  //   checks: ['rate>0.95'], // Ensure 95% of checks pass
  // },
};


export default () => {
  const URL = `${socketURI}?apikey=${token}`;

  const res = ws.connect(URL, {}, (socket) => {
    socket.on("open", () => {
      rooms.forEach((room) => {
        socket.send(JSON.stringify({
          topic: `realtime:${room}`,
          event: "phx_join",
          payload: {
            config: {
              broadcast: { self: true },
              presence: { key: "" },
              private: false,
            },
            access_token: token,
          },
          ref: "1",
          join_ref: "1",
        }));

        socket.send(JSON.stringify({
          topic: `realtime:${room}`,
          event: "access_token",
          payload: { access_token: token },
          ref: "2",
        }));
      });

      // Send heartbeat
      socket.setInterval(() => {
        socket.send(JSON.stringify({
          topic: "phoenix",
          event: "heartbeat",
          payload: {},
          ref: 0,
        }));
      }, 30000);

      // Send messages to random rooms
      socket.setInterval(() => {
        rooms.forEach((room) => {
          if (Math.random() < rate / (conns * instances)) {
            socket.send(JSON.stringify({
              topic: `realtime:${room}`,
              event: "broadcast",
              payload: {
                event: "new message",
                payload: {
                  message: "Hello world",
                  created_at: Date.now(),
                },
              },
              ref: 0,
            }));
          }
        });
      }, 5000); // Every 5s try to broadcast
    });

    socket.on("message", (msg) => {
      msg = JSON.parse(msg);
      if (msg.event === "broadcast") {
        check(msg, {
          "received broadcast": (m) => m.event === "broadcast",
        });
      }
    });

    socket.on("error", (e) => {
      if (e.error() !== "websocket: close sent") {
        console.error("WebSocket error: ", e.error());
      }
    });

    socket.setTimeout(() => {
      socket.close();
    }, duration * 1000);
  });

  check(res, { "WebSocket upgrade success (101)": (r) => r && r.status === 101 });
};
