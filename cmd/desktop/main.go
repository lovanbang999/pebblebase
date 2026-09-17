package main

import (
	"log"

	"pebblebase"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/linux"
)

func main() {
	app := NewApp()

	frontendFS, err := pebblebase.FrontendFS()
	if err != nil {
		log.Printf("warning: frontend assets not loaded: %v", err)
	}

	err = wails.Run(&options.App{
		Title:             "Pebblebase Studio",
		Width:             1366,
		Height:            850,
		MinWidth:          1024,
		MinHeight:         640,
		AssetServer: &assetserver.Options{
			Assets:  frontendFS,
			Handler: app.Mux(),
		},
		BackgroundColour:  &options.RGBA{R: 9, G: 9, B: 11, A: 255}, // Zinc-950 dark theme
		OnStartup:         app.startup,
		OnShutdown:        app.shutdown,
		Bind: []interface{}{
			app,
		},
		Linux: &linux.Options{
			Icon:                nil,
			WindowIsTranslucent: false,
			WebviewGpuPolicy:    linux.WebviewGpuPolicyOnDemand,
		},
	})

	if err != nil {
		log.Fatalf("Error running desktop app: %v", err)
	}
}
