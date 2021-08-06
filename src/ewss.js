// Server-side Eventful WebSockets


const { WebSocket, WebSocketServer } = require("ws")
const { parse } = require("url")


function buildEWSMessage(event, data) {
    return JSON.stringify({ event, data })
}


function parseEWSMessage(message) {
    return JSON.parse(message)
}


class EventfulWebSocketServer {

    constructor() {
        this.socket = null
        this.events = {}
        this.authenticator = null
        this.onOpenHandler = null
        this.onCloseHandler = null
        this.onErrorHandler = null
        this.onMessageHandler = null
    }

    useAuthenticator(authenticator) {
        this.authenticator = authenticator
        return this
    }

    onOpen(handler) {
        this.onOpenHandler = handler
        return this
    }

    onClose(handler) {
        this.onCloseHandler = handler
        return this
    }

    onError(handler) {
        this.onErrorHandler = handler
        return this
    }

    onMessage(handler) {
        this.onMessageHandler = handler
        return this
    }

    emit(websocket, event, data) {
        if (websocket.readyState === WebSocket.OPEN) {
            const message = buildEWSMessage(event, data)
            websocket.send(message)
        }
    }

    broadcast(event, data, rule) {
        this.socket.clients.forEach(websocket => {
            if (rule && !rule(websocket)) return
            this.emit(websocket, event, data)
        })
    }

    subscribe(event, handler) {
        if ( !(event in this.events) )
            this.events[event] = []
        this.events[event].push(handler)
        return this
    }

    init() {
        this.socket = new WebSocketServer({ noServer: true })

        this.socket.on("connection", (websocket, request) => {

            websocket.remote = {
                address: websocket._socket.remoteAddress,
                port: websocket._socket.remotePort,
                fullAddress: websocket._socket.remoteAddress + ":" + websocket._socket.remotePort
            }

            this.onOpenHandler && this.onOpenHandler(websocket, request)

            websocket.on("close", (code, reason) => 
                this.onConnectHandler && this.onCloseHandler(websocket, request, code, reason.toString()))

            websocket.on("error", error =>
                this.onErrorHandler && this.onErrorHandler(websocket, error))


            websocket.on("message", (message, isBinary) => {
                this.onMessageHandler && this.onMessageHandler(websocket, message, isBinary)
                const { event, data } = parseEWSMessage(message)
                for (const subscription of this.events[event] || []) {
                    subscription(websocket, data, isBinary)
                }
            })
        })

        return this
    }

    isInitialized() {
        return this.socket !== null
    }

    getWSS() {
        return this.socket
    }

}


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