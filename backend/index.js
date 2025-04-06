const WebSocket = require("ws");
const express = require("express");
const server = express();
const http = require("http").createServer(server);

const port = process.env.PORT || 3001;

wss = new WebSocket.Server({ noServer: true, path: "/chat" });

const rooms = {};

wss.on("connection", (ws, req, client) => {
  ws.on("message", (message) => {
    const msg = JSON.parse(message.toString());
    const { type, room, name, msg: data } = msg;
    switch (type) {
      case "join":
        if (!rooms[room]) {
          rooms[room] = { users: [] };
        }
        ws.username = name;

        // check if current username is found in the room or not
        if (rooms[room].users.every((user) => user.username !== name)) {
          rooms[room].users.push(ws);
          ws.send(
            JSON.stringify({ msg: `welcome to ${room} room`, type: "info" })
          );
          rooms[room].users.forEach((client) => {
            if (client !== ws) {
              client.send(
                JSON.stringify({
                  msg: `${ws.username} joined the room`,
                  type: "info",
                })
              );
            }
          });

          // leave from other rooms
          Object.keys(rooms).forEach((roomK) => {
            // if roomk !== current room && rooms[roomK] has current user
            if (roomK !== room && rooms[roomK].users.includes(ws)) {
              // delete current user
              rooms[roomK].users = rooms[roomK].users.filter(
                (user) => user !== ws
              );

              if (rooms[roomK].users.length > 0) {
                // send info to other clients that current user leave the room
                rooms[roomK].users.forEach((client) =>
                  client.send(
                    JSON.stringify({
                      type: "info",
                      msg: `${ws.username} leaved the room`,
                    })
                  )
                );
              } else {
                // delete room if it has 0 users
                delete rooms[roomK];
              }
            }
          });
        }
        break;
      case "message":
        if (rooms[room] && rooms[room]?.users?.includes(ws)) {
          rooms[room].users.forEach((client) => {
            client.send(JSON.stringify(msg));
          });
        } else {
          ws.send(
            JSON.stringify({
              type: "info",
              msg: "you aren't joined in this room",
            })
          );
          ws.close();
        }
    }
  });

  ws.on("close", () => {
    Object.keys(rooms).forEach((roomKey) => {
      const room = rooms[roomKey];
      if (room.users.includes(ws)) {
        room.users = room.users.filter((user) => user !== ws);
        if (room.users.length === 0) {
          delete rooms[roomKey];
        } else {
          room.users.forEach((client) =>
            client.send(
              JSON.stringify({
                type: "info",
                msg: `${ws.username} leaved the room`,
              })
            )
          );
        }
      }
    });
  });
});

http.on("upgrade", (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    // Emit the connection event
    wss.emit("connection", ws, request);
  });
});

http.listen(
  port,
  setTimeout(() => {
    console.log("server is running in " + port);
  }, 1000)
);
