package main

import (
	"encoding/json"
	"log"

	"github.com/gorilla/websocket"
)

func main() {
	conn, _, err := websocket.DefaultDialer.Dial("ws://localhost:8080/ws", nil)
	if err != nil {
		log.Fatal("dial:", err)
	}
	defer conn.Close()

	log.Println("Bob connected to gateway")

	join := map[string]interface{}{
		"type":   "join",
		"docId":  "test-document",
		"userId": "user-2",
		"name":   "Bob",
	}

	if err := conn.WriteJSON(join); err != nil {
		log.Fatal("write join:", err)
	}

	log.Println("Bob sent join packet")

	// Bob should receive a snapshot containing Alice and Bob.
	_, response, err := conn.ReadMessage()
	if err != nil {
		log.Fatal("read snapshot:", err)
	}

	log.Printf("Bob received: %s", response)

	// Now Bob waits for Alice's operation.
	_, response, err = conn.ReadMessage()
	if err != nil {
		log.Fatal("read operation:", err)
	}

	log.Printf("Bob received operation: %s", response)

	for {
		_, response, err = conn.ReadMessage()
		if err != nil {
			log.Fatal("read message:", err)
		}

		log.Printf("Bob received: %s", response)

		if len(response) > 0 {
			var message struct {
				Type string `json:"type"`
			}

			if err := json.Unmarshal(response, &message); err != nil {
				log.Fatal("parse message:", err)
			}

			if message.Type == "op" {
				log.Println("Bob received an operation!")
				break
			}
		}
	}
}
