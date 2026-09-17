package main

import (
	"context"
	"log"
	"time"

	"pebblebase"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/linux"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

func main() {
	app := NewApp()

	frontendFS, err := pebblebase.FrontendFS()
	if err != nil {
		log.Printf("warning: frontend assets not loaded: %v", err)
	}

	err = wails.Run(&options.App{
		Title:            "Pebblebase Studio",
		Width:            1366,
		Height:           850,
		MinWidth:         1024,
		MinHeight:        640,
		WindowStartState: options.Maximised,
		StartHidden:      true,
		OnDomReady: func(ctx context.Context) {
			// Ensure WebKitGTK compositor has flushed the dark splash frame to the window buffer
			time.Sleep(120 * time.Millisecond)
			runtime.WindowShow(ctx)
		},
		AssetServer: &assetserver.Options{
			Assets:  frontendFS,
			Handler: app.Mux(),
		},
		BackgroundColour: &options.RGBA{R: 9, G: 9, B: 11, A: 255}, // Zinc-950 dark theme
		OnStartup:        app.startup,
		OnShutdown:       app.shutdown,
		Bind: []interface{}{
			app,
		},
		Linux: &linux.Options{
			Icon:                nil,
			WindowIsTranslucent: false,
			WebviewGpuPolicy:    linux.WebviewGpuPolicyOnDemand,
			ProgramName:         "pebblebase",
		},
	})

	if err != nil {
		log.Fatalf("Error running desktop app: %v", err)
	}
}
