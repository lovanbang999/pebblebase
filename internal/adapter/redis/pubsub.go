package redis

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

// PubSubMessage represents an event emitted on a subscribed Redis channel.
type PubSubMessage struct {
	Channel   string    `json:"channel"`
	Pattern   string    `json:"pattern,omitempty"`
	Payload   string    `json:"payload"`
	Timestamp time.Time `json:"timestamp"`
}

// Subscribe opens a subscription for the specified channels and/or glob patterns.
// It returns a receive-only channel yielding PubSubMessage objects and a cleanup
// function that must be called to close the subscription and release Redis resources.
func (a *Adapter) Subscribe(ctx context.Context, channels []string, patterns []string) (<-chan PubSubMessage, func(), error) {
	cleanChannels := cleanSlice(channels)
	cleanPatterns := cleanSlice(patterns)

	if len(cleanChannels) == 0 && len(cleanPatterns) == 0 {
		return nil, nil, fmt.Errorf("redis: at least one channel or pattern is required to subscribe")
	}

	var pubsub *redis.PubSub
	if len(cleanChannels) > 0 {
		pubsub = a.client.Subscribe(ctx, cleanChannels...)
	} else {
		pubsub = a.client.PSubscribe(ctx, cleanPatterns...)
	}

	if len(cleanChannels) > 0 && len(cleanPatterns) > 0 {
		if err := pubsub.PSubscribe(ctx, cleanPatterns...); err != nil {
			_ = pubsub.Close()
			return nil, nil, fmt.Errorf("redis: psubscribe patterns: %w", err)
		}
	}

	out := make(chan PubSubMessage, 100)
	done := make(chan struct{})

	go func() {
		defer close(out)
		rch := pubsub.Channel()
		for {
			select {
			case <-done:
				return
			case msg, ok := <-rch:
				if !ok {
					return
				}
				outMsg := PubSubMessage{
					Channel:   msg.Channel,
					Pattern:   msg.Pattern,
					Payload:   msg.Payload,
					Timestamp: time.Now().UTC(),
				}
				select {
				case out <- outMsg:
				case <-done:
					return
				}
			}
		}
	}()

	cleanup := func() {
		select {
		case <-done:
			// already closed
		default:
			close(done)
		}
		_ = pubsub.Close()
	}

	return out, cleanup, nil
}

// Publish publishes a message to the specified Redis channel and returns the number
// of clients that received the message.
func (a *Adapter) Publish(ctx context.Context, channel, message string) (int64, error) {
	trimmed := strings.TrimSpace(channel)
	if trimmed == "" {
		return 0, fmt.Errorf("redis: channel name cannot be empty")
	}
	return a.client.Publish(ctx, trimmed, message).Result()
}

func cleanSlice(items []string) []string {
	var result []string
	for _, item := range items {
		t := strings.TrimSpace(item)
		if t != "" {
			result = append(result, t)
		}
	}
	return result
}
