// Server-side Eventful WebSockets


const WebSocket = require("ws")
const { parse } = require("url")


function buildEWSMessage(event, data) {
    return JSON.stringify({ event, data })
}


function parseEWSMessage(message) {

    try {
        const json = JSON.parse(message)
        return { ok: true, body: json }
    }

    finally {
        return { ok: false, body: null }
    }
}


/**
 * An eventful WebSocket server for handling regular messages as well as eventful ones.
 */
class EventfulWebSocketServer {

    /**
     * Creates a new EventfulWebSocketServer instance.
     * The instance should be configured using the class methods.
     */
    constructor() {
        this._socket = null
        this._events = {}
        this._authenticator = null
        this._onOpenHandler = null
        this._onCloseHandler = null
        this._onErrorHandler = null
        this._onMessageHandler = null
    }

    /**
     * Sets an authenticator for the WebSocket server.
     * The authenticator should be a function that:
     *  - Takes an `HTTP request` and a `query` object as its arguments (`req`, `query`)
     *  - Returns a `boolean` value indicating whether the authentication was successful
     * @param {Function} authenticator - The authenticator function
     * @returns EventfulWebSocketServer
     */
    useAuthenticator(authenticator) {
        this._authenticator = authenticator
        return this
    }

    /**
     * Sets a handler function for the `onopen` WebSocket event.
     * The handle function should take the client `WebSocket instance` as an argument.
     * @param {Function} handler - The `onopen` event handler function
     * @returns EventfulWebSocketServer
     */
    onOpen(handler) {
        this._onOpenHandler = handler
        return this
    }

    /**
     * Sets a handler function for the `onclose` WebSocket event.
     * The handle function should take the client `WebSocket instance`, `code` and `reason` as arguments.
     * @param {Function} handler - The `onclose` event handler function.
     * @returns EventfulWebSocketServer
     */
    onClose(handler) {
        this._onCloseHandler = handler
        return this
    }

    /**
     * Sets a handler function for the `onerror` WebSocket event.
     * The handle function should take the client `WebSocket instance` and `error` as arguments.
     * @param {Function} handler - The `onerror` event handler function
     * @returns EventfulWebSocketServer
     */
    onError(handler) {
        this._onErrorHandler = handler
        return this
    }

    /**
     * Sets a handler function for the `onmessage` WebSocket event.
     * The handle function should take the client `WebSocket instance`, `message` and `isBinary` as arguments.
     * @param {Function} handler - The `onmessage` event handler function
     * @returns EventfulWebSocketServer
     */
    onMessage(handler) {
        this._onMessageHandler = handler
        return this
    }

    /**
     * Emits an event.
     * The specified WebSocket gets sent a JSON encoded message containing the event name and the data.
     * @param {WebSocket} websocket - The client WebSocket instance
     * @param {String} event - The event name
     * @param {*} data - The data (content) to be sent to the client.
     */
    emit(websocket, event, data) {
        if (websocket.readyState === WebSocket.OPEN) {
            const message = buildEWSMessage(event, data)
            websocket.send(message)
        }
    }

    /**
     * Broadcasts an event.
     * This method emits an event to each client connected to the server.
     * The optional `rule` parameter should be a function that takes a WebSocket instance as an argument,
     * and returns a boolean value indicating whether the event should be emitted to the client.
     * @param {String} event - The name of the event
     * @param {*} data  - The data (content) to be sent to the client.
     * @param {Function} rule - The function to determine whether the client should receive the broadcast.
     */
    broadcast(event, data, rule = null) {
        this._socket.clients.forEach(websocket => {
            if (rule && !rule(websocket)) return
            this.emit(websocket, event, data)
        })
    }

    /**
     * Subscribes to an event. Events are triggered on the client side.
     * @param {String} event - The name of the event
     * @param {Function} handler - The event handler function (`WebSocket`, `message`, `isBinary`)
     * @returns EventfulWebSocketServer
     */
    subscribe(event, handler) {
        if ( !(event in this._events) )
            this._events[event] = []
        this._events[event].push(handler)
        return this
    }

    /**
     * Initializes the WebSocket server.
     * This method is called automatically by `addEventfulWebSocketHandlers`,
     * and thus does not have to be called manually.
     * @returns EventfulWebSocketServer
     */
    init() {
        this._socket = new WebSocket.Server({ noServer: true })

        this._socket.on("connection", (websocket, request) => {

            websocket.remote = {
                address: websocket._socket.remoteAddress,
                port: websocket._socket.remotePort,
                fullAddress: websocket._socket.remoteAddress + ":" + websocket._socket.remotePort
            }

            websocket.request = request

            this._onOpenHandler && this._onOpenHandler(websocket)

            websocket.on("close", (code, reason) => 
                this._onCloseHandler && this._onCloseHandler(websocket, code, reason.toString()))

            websocket.on("error", error =>
                this._onErrorHandler && this._onErrorHandler(websocket, error))

            websocket.on("message", (message, isBinary) => {
                this._onMessageHandler && this._onMessageHandler(websocket, message, isBinary)
                const json = parseEWSMessage(message)
                if (json.ok) {
                    for (const subscription of this._events[json.event] || []) {
                        subscription(websocket, json.data, isBinary)
                    }
                }
            })
        })

        return this
    }

    /**
     * Returns `true` if the server socket has been initialized.
     * @returns Bool
     */
    isInitialized() {
        return this._socket !== null
    }

    /**
     * Returns the `WebSocket.Server` instance.
     * @returns WebSocket.Server
     */
    getWSS() {
        return this._socket
    }

}


/**
 * Configures EventfulWebSocket servers as a part of the specified HTTP server.
 * This function handles the HTTP upgrade requests automatically.
 * The keys of the `ewssRouter` object should be URL paths (`string`)
 * and the values should be `EventfulWebSocketServer` instances
 * @param {*} httpServer - An HTTP server instance (Such as one created with `http.createServer`)
 * @param {object} ewssRouter - An EWSS router object.
 */
function addEventfulWebSocketHandlers(httpServer, ewssRouter) {

    httpServer.on("upgrade", (req, socket, head) => {
        const parsedUrl = parse(req.url, true)

        if (parsedUrl.pathname in ewssRouter) {
            const ewss = ewssRouter[parsedUrl.pathname]
            const authenticated = ewss.authenticator ? ewss.authenticator(req, parsedUrl.query) : true

            !ewss.isInitialized() && ewss.init()

            if (authenticated) {
                const wss = ewss.getWSS()
                return wss.handleUpgrade(req, socket, head, (ws, wsReq) => wss.emit("connection", ws, wsReq))
            }
        }
        socket.destroy()
    })
}

module.exports = {
    EventfulWebSocketServer,
    addEventfulWebSocketHandlers,
}