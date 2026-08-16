package main

import (
	"log"

	"github.com/gorilla/websocket"
)

func main() {
	conn, _, err := websocket.DefaultDialer.Dial("ws://localhost:8080/ws", nil)
	if err != nil {
		log.Fatal("dial:", err)
	}
	defer conn.Close()

	log.Println("connected to gateway")

	// 1. JOIN
	join := map[string]interface{}{
		"type":   "join",
		"docId":  "test-document",
		"userId": "user-1",
		"name":   "Alice",
	}

	if err := conn.WriteJSON(join); err != nil {
		log.Fatal("write join:", err)
	}

	log.Println("join packet sent")

	// 2. Read SNAPSHOT
	_, response, err := conn.ReadMessage()
	if err != nil {
		log.Fatal("read snapshot:", err)
	}

	log.Printf("server response: %s", response)

	// 3. Send INSERT operation
	op := map[string]interface{}{
		"type":     "insert",
		"position": 0,
		"length":   0,
		"text":     "hello",
		"opId":     "op-1",
		"actor":    "user-1",
	}

	message := map[string]interface{}{
		"type":    "op",
		"payLoad": op,
	}

	if err := conn.WriteJSON(message); err != nil {
		log.Fatal("write op:", err)
	}

	log.Println("insert operation sent")

	// 4. Read the broadcast operation
	_, response, err = conn.ReadMessage()
	if err != nil {
		log.Fatal("read op:", err)
	}

	log.Printf("server response: %s", response)
}