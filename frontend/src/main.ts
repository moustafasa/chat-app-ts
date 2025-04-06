import "./font-awesome/js/all.min.js";

type wsMsg = {
  type: string;
  room: string;
  msg?: string;
  name: string;
  createdAt?: number;
};

let ws: WebSocket;
const sendButton = <HTMLButtonElement>document.getElementById("submit-btn");
const chatBox = <HTMLDivElement>document.querySelector(".chat-box");
const msgForm = <HTMLFormElement>document.querySelector(".form-msg");
const joinForm = <HTMLFormElement>document.querySelector(".form-join");
const msgQueue: wsMsg[] = [];

function connect() {
  ws = new WebSocket("ws://localhost:3001/chat");

  ws.onopen = () => {
    sendButton.disabled = false;
    while (msgQueue.length > 0) {
      ws.send(JSON.stringify(msgQueue.shift()));
    }
  };

  ws.onclose = () => {
    sendButton.disabled = true;
    setTimeout(() => {
      connect();
    }, 1000);
  };

  ws.onmessage = (e) => {
    const message = JSON.parse(e.data);
    if (message.type === "message")
      createMsgBox({
        name: message.name,
        msg: message.msg,
        date: Intl.DateTimeFormat("en-US", {
          hour: "2-digit",
          minute: "2-digit",
        }).format(message.createdAt),
      });
    else if (message.type === "info") createInfoBox(message.msg);
  };

  ws.onerror = () => {
    ws.close();
  };
}

function createMsgBox(message: {
  name: string;
  msg: string;
  date: string;
}): void {
  const { name, msg, date } = message;

  const msgTemp = `
      <div class="msg-box text-capitalize ${
        name !== joinForm.username.value ? "" : "me"
      }">
        <div
          class="msg-header d-flex justify-content-between align-items-center py-2 px-3 rounded border-bottom"
        >
          <div class="rounded-circle img bg-secondary"></div>
          <div>${name}</div>
        </div>
        <div class="py-2 px-3 border rounded">
          <div class="">
            ${msg}
          </div>
          <div class="time d-flex justify-content-end gap-2">
            <small>${date}</small>
            <i class="fa-solid fa-check-double text-info"></i>
          </div>
        </div>
      </div>
  `;
  chatBox.innerHTML += msgTemp;
}

function createInfoBox(msg: string): void {
  const msgTemp = `<div class="text-capitalize border p-2 text-info rounded">
                  ${msg}
               </div>`;
  chatBox.innerHTML += msgTemp;
}

function sendMessage(data: wsMsg): void {
  if (ws.readyState !== ws.OPEN) {
    msgQueue.push(data);
  } else {
    ws.send(JSON.stringify(data));
  }
}

function enterRoom(e?: SubmitEvent): void {
  if (e) e.preventDefault();
  const name = joinForm.username.value;
  const room = joinForm.room.value;
  if (name && room) {
    chatBox.innerHTML = "";
    sendMessage({ type: "join", room, name });
  }
}

joinForm.addEventListener("submit", enterRoom);

msgForm.addEventListener("submit", (e: SubmitEvent): void => {
  e.preventDefault();
  if (msgForm.msg.value) {
    sendMessage({
      type: "message",
      room: joinForm.room.value,
      name: joinForm.username.value,
      msg: msgForm.msg.value,
      createdAt: new Date().getTime(),
    });
    msgForm.msg.value = "";
  }
});

connect();
