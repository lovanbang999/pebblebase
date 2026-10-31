package redis

import "testing"

func TestRawCommandQuotedArguments(t *testing.T) {
	args, err := parseCommandArgs(`SET "a b" '' "c d"`)
	if err != nil || len(args) != 4 || args[1] != "a b" || args[2] != "" || args[3] != "c d" {
		t.Fatal(args, err)
	}
	for _, query := range []string{`SET 'bad`, `SET x y\`} {
		if _, err := parseCommandArgs(query); err == nil {
			t.Fatal("accepted malformed command")
		}
	}
	for _, command := range []string{"INCR", "DECR", "APPEND"} {
		if !isMutationCommand(command) {
			t.Fatal(command)
		}
	}
}
