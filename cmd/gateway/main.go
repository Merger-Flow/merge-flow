package main

import (
	"log"
	"net/http"

	"github.com/nowinav/merge-flow/internal/transport"
)

func main() {

	http.HandleFunc("/", homeHandler)
	http.HandleFunc("/ws", transport.WSHandler)

	log.Println("Gateway listening on :8080")

	if err := http.ListenAndServe(":8080", nil); err != nil {
		log.Fatal(err)
	}
}

func homeHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write([]byte(`{"service":"merge-flow","websocket":"/ws"}`))
}
