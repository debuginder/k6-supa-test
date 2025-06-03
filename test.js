import { check } from "k6";
import http from "k6/http";
import ws from "k6/ws";

const token = __ENV.SUPABASE_KEY;
const socketURI = `wss://${__ENV.HOSTNAME}/realtime/v1/websocket`;
const conns = __ENV.CONNS || 1;
const instances = __ENV.INSTANCES ? parseInt(__ENV.INSTANCES) : 1;
const rate = __ENV.RATE ? parseInt(__ENV.RATE) : 1;
const roomNumber = __ENV.ROOMS ? parseInt(__ENV.ROOMS) : 1;
const baseDuration = __ENV.DURATION || 60;
const duration = parseInt(baseDuration) + 30;

const rooms = [];
for (let i = 0; i < roomNumber; i++) {
  rooms.push(`channel_${i}`);
}

export const options = {
  vus: 1,
  scenarios: {
    broadcast_authenticated: {
      executor: "shared-iterations",
      vus: 1,
      iterations: 1,
      maxDuration: `${duration}s`,
    },
  },
};

export default () => {
  const URL = `${socketURI}?apikey=${token}`;
  const res = ws.connect(URL, {}, (socket) => {
    socket.on("open", () => {
      rooms.forEach((room) => {
        socket.send(
          JSON.stringify({
            topic: `realtime:${room}`,
            event: "phx_join",
            payload: {
              config: {
                broadcast: {
                  self: true,
                },
                presence: {
                  key: "",
                },
                private: false,
              },
              access_token: token,
            },
            ref: "1",
            join_ref: "1",
          })
        );

        socket.send(
          JSON.stringify({
            topic: `realtime:${room}`,
            event: "access_token",
            payload: {
              access_token: token,
            },
            ref: "2",
          })
        );
      });

      socket.setInterval(() => {
        socket.send(
          JSON.stringify({
            topic: "phoenix",
            event: "heartbeat",
            payload: {},
            ref: 0,
          })
        );
      }, 30 * 1000);

      socket.setInterval(() => {
        rooms.forEach((room) => {
          if (Math.floor(Math.random() * (conns * instances / 10)) < rate) {
            socket.send(
              JSON.stringify({
                topic: `realtime:${room}`,
                event: "broadcast",
                payload: {
                  event: "new message",
                  payload: {
                    message: "Hello, world!",
                    created_at: Date.now(),
                  },
                },
                ref: 0,
              })
            );
          }
        });
      }, 10 * 1000);
    });

    socket.on("message", (msg) => {
      msg = JSON.parse(msg);

      if (msg.event === "broadcast") {
        check(msg, {
          "received broadcast event": (m) => m.event === "broadcast",
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
