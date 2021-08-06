# eventful-ws
An event-driven web socket library for Node, `eventful-ws` is an easy way to setup websockets in your front-end and back-end applications.

## Building a simple chat server with Next.js
In your Node server application, call the `addEventfulWebSocketHandlers` function to register WebSocket end points. In the code below we are registering the `/chat` URL path with out imported `ChatServer`.
```js
import next from 'next'
import { createServer } from 'http'
import { addEventfulWebSocketHandlers } from 'eventful-wss'
import ChatServer from './chat.mjs'

const port = 3000
const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()

app.prepare().then(() => {

  const server = createServer(handle)

  addEventfulWebSocketHandlers(server, {
    "/chat": ChatServer
  })
  
  server.listen(port, (err) => {
    if (err) throw err
    console.log(`> Ready on http://localhost:${port}`)
  })

})
```
The chat server code looks like this:
```js
import { EventfulWebSocketServer } from 'eventful-wss'


const chatServer = new EventfulWebSocketServer()

    // Client is trying to start a websocket connection (upgrade request)
    .useAuthenticator((req, query) => {
        return query.password === "password123"
    })

    // Client connects to a websocket
    .onOpen(websocket => {
        console.log("A new client connected to the server!")
    })

    // Client connection is closed
    .onClose((websocket, req) => {
        console.log("A client disconnected...")
    })

    // Client sends a message
    .onMessage((websocket, message, isBinary) => {
        console.log("Server received a message:", message.toString())
    })

    // Subscribes to a custom event called "ping" 
    .subscribe("ping", (clientWs, message, isBinary) => {
        const data = {msg: "Hello, world!"}
        // Send a message to the client, triggering the "pong" event on the client side.
        chatServer.emit(clientWs, "pong", data)
    })

    .subscribe("broadcast-chat-message", (senderWs, message, isBinary) => {
        // Send a message to each client connected to the server.
        chatServer.broadcast("new-chat-message", message, recipientWs => {
            // Here you could define a rule to apply to the client.
            // If this function returns true, the message will be sent to them.
            return true
        })
    })

export default chatServer
```

And that's it! Running the HTTP server will also run the WebSocket server. The WebSocket server is ready to receive messages and will trigger upon events that have been subscribed to (`ping` and `broadcast-chat-message`).