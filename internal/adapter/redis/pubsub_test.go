package redis

import (
	"context"
	"testing"
	"time"
)

func TestPubSub_SubscribeAndPublish(t *testing.T) {
	adp, _ := setupTestRedis(t)
	ctx := context.Background()

	// Empty channels and patterns should return error
	_, _, err := adp.Subscribe(ctx, nil, nil)
	if err == nil {
		t.Fatalf("expected error when subscribing with no channels or patterns")
	}

	// Subscribe to a specific channel
	msgChan, cleanup, err := adp.Subscribe(ctx, []string{"notifications", "alerts"}, []string{"events.*"})
	if err != nil {
		t.Fatalf("unexpected error subscribing: %v", err)
	}
	defer cleanup()

	// Wait briefly to ensure subscription is active
	time.Sleep(50 * time.Millisecond)

	// Publish to channel "notifications"
	receivers, err := adp.Publish(ctx, "notifications", "hello world")
	if err != nil {
		t.Fatalf("unexpected error publishing: %v", err)
	}
	if receivers < 1 {
		t.Logf("note: receivers count is %d (miniredis pubsub behavior)", receivers)
	}

	// Read message with timeout
	select {
	case msg := <-msgChan:
		if msg.Channel != "notifications" {
			t.Errorf("expected channel 'notifications', got %q", msg.Channel)
		}
		if msg.Payload != "hello world" {
			t.Errorf("expected payload 'hello world', got %q", msg.Payload)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for pubsub message on 'notifications'")
	}

	// Publish matching pattern "events.user_login"
	_, err = adp.Publish(ctx, "events.user_login", `{"user_id":"u1"}`)
	if err != nil {
		t.Fatalf("unexpected error publishing pattern message: %v", err)
	}

	select {
	case msg := <-msgChan:
		if msg.Channel != "events.user_login" {
			t.Errorf("expected channel 'events.user_login', got %q", msg.Channel)
		}
		if msg.Payload != `{"user_id":"u1"}` {
			t.Errorf("expected payload '{\"user_id\":\"u1\"}', got %q", msg.Payload)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for pubsub message on pattern 'events.*'")
	}
}

func TestPubSub_PublishValidation(t *testing.T) {
	adp, _ := setupTestRedis(t)
	ctx := context.Background()

	_, err := adp.Publish(ctx, "   ", "some message")
	if err == nil {
		t.Fatal("expected error publishing to empty channel")
	}
}
