//go:build linux

package main

import (
	"log"
	"sync"
	"time"

	"github.com/ebitengine/purego"
)

type gList struct {
	data uintptr
	next *gList
	prev *gList
}

var (
	puregoInitOnce sync.Once
	puregoInitErr  error

	gtkWindowListToplevels  func() *gList
	gtkContainerGetChildren func(container uintptr) *gList
	gtkContainerGetType     func() uintptr
	gListFree               func(list *gList)
	gCheckInstanceIsA       func(instance uintptr, ifaceType uintptr) int
	gObjectGetData          func(object uintptr, key *byte) uintptr
	gObjectSetData          func(object uintptr, key *byte, data uintptr)
	gSignalHandlersDestroy  func(instance uintptr)
	gSignalConnectData      func(instance uintptr, signal *byte, handler uintptr, data uintptr, destroyData uintptr, connectFlags int) uintptr
	gIdleAdd                func(function uintptr, data uintptr) uint
	wkWebViewGetType        func() uintptr
	wkWebViewSetZoomLevel   func(webView uintptr, zoomLevel float64)
	wkWebViewGetZoomLevel   func(webView uintptr) float64

	zoomGestureKey = []byte("wk-view-zoom-gesture\x00")
	zoomGuardKey   = []byte("pebblebase-zoom-guard\x00")
	notifyZoomSig  = []byte("notify::zoom-level\x00")

	onZoomChangedCallback uintptr
	idleCallback          uintptr
)

func initPuregoLinux() error {
	puregoInitOnce.Do(func() {
		gtk, err := purego.Dlopen("libgtk-3.so.0", purego.RTLD_LAZY|purego.RTLD_GLOBAL)
		if err != nil {
			puregoInitErr = err
			return
		}

		glib, err := purego.Dlopen("libglib-2.0.so.0", purego.RTLD_LAZY|purego.RTLD_GLOBAL)
		if err != nil {
			puregoInitErr = err
			return
		}

		gobj, err := purego.Dlopen("libgobject-2.0.so.0", purego.RTLD_LAZY|purego.RTLD_GLOBAL)
		if err != nil {
			puregoInitErr = err
			return
		}

		wk, err := purego.Dlopen("libwebkit2gtk-4.1.so.0", purego.RTLD_LAZY|purego.RTLD_GLOBAL)
		if err != nil {
			wk, err = purego.Dlopen("libwebkit2gtk-4.0.so.0", purego.RTLD_LAZY|purego.RTLD_GLOBAL)
		}
		if err != nil {
			puregoInitErr = err
			return
		}

		purego.RegisterLibFunc(&gtkWindowListToplevels, gtk, "gtk_window_list_toplevels")
		purego.RegisterLibFunc(&gtkContainerGetChildren, gtk, "gtk_container_get_children")
		purego.RegisterLibFunc(&gtkContainerGetType, gtk, "gtk_container_get_type")
		purego.RegisterLibFunc(&gListFree, glib, "g_list_free")
		purego.RegisterLibFunc(&gIdleAdd, glib, "g_idle_add")
		purego.RegisterLibFunc(&gCheckInstanceIsA, gobj, "g_type_check_instance_is_a")
		purego.RegisterLibFunc(&gObjectGetData, gobj, "g_object_get_data")
		purego.RegisterLibFunc(&gObjectSetData, gobj, "g_object_set_data")
		purego.RegisterLibFunc(&gSignalHandlersDestroy, gobj, "g_signal_handlers_destroy")
		purego.RegisterLibFunc(&gSignalConnectData, gobj, "g_signal_connect_data")
		purego.RegisterLibFunc(&wkWebViewGetType, wk, "webkit_web_view_get_type")
		purego.RegisterLibFunc(&wkWebViewSetZoomLevel, wk, "webkit_web_view_set_zoom_level")
		purego.RegisterLibFunc(&wkWebViewGetZoomLevel, wk, "webkit_web_view_get_zoom_level")

		onZoomChangedCallback = purego.NewCallback(func(webView uintptr, _ uintptr, _ uintptr) uintptr {
			if wkWebViewGetZoomLevel != nil && wkWebViewSetZoomLevel != nil {
				if wkWebViewGetZoomLevel(webView) != 1.0 {
					wkWebViewSetZoomLevel(webView, 1.0)
				}
			}
			return 0
		})

		idleCallback = purego.NewCallback(func(_ uintptr) uintptr {
			disarmAllToplevels()
			return 0 // G_SOURCE_REMOVE
		})
	})

	return puregoInitErr
}

func disarmWidget(widget uintptr) {
	if widget == 0 {
		return
	}

	if wkWebViewGetType != nil && gCheckInstanceIsA(widget, wkWebViewGetType()) != 0 {
		if wkWebViewGetZoomLevel(widget) != 1.0 {
			wkWebViewSetZoomLevel(widget, 1.0)
		}

		gesture := gObjectGetData(widget, &zoomGestureKey[0])
		if gesture != 0 {
			gSignalHandlersDestroy(gesture)
			gObjectSetData(widget, &zoomGestureKey[0], 0)
		}

		if gObjectGetData(widget, &zoomGuardKey[0]) == 0 {
			gSignalConnectData(widget, &notifyZoomSig[0], onZoomChangedCallback, 0, 0, 0)
			gObjectSetData(widget, &zoomGuardKey[0], 1)
		}
		return
	}

	if gtkContainerGetType != nil && gCheckInstanceIsA(widget, gtkContainerGetType()) != 0 {
		children := gtkContainerGetChildren(widget)
		if children != nil {
			for cur := children; cur != nil; cur = cur.next {
				disarmWidget(cur.data)
			}
			gListFree(children)
		}
	}
}

func disarmAllToplevels() {
	if gtkWindowListToplevels == nil {
		return
	}
	toplevels := gtkWindowListToplevels()
	if toplevels == nil {
		return
	}
	for cur := toplevels; cur != nil; cur = cur.next {
		disarmWidget(cur.data)
	}
	gListFree(toplevels)
}

func scheduleDisarm() {
	if gIdleAdd != nil && idleCallback != 0 {
		gIdleAdd(idleCallback, 0)
	}
}

func disableLinuxPinchZoom() {
	if err := initPuregoLinux(); err != nil {
		log.Printf("warning: could not initialize purego linux zoom disabler: %v", err)
		return
	}

	scheduleDisarm()

	// Run periodic guards to catch WebKit widget attachment after window mapping
	go func() {
		delays := []time.Duration{
			50 * time.Millisecond,
			150 * time.Millisecond,
			300 * time.Millisecond,
			600 * time.Millisecond,
			1200 * time.Millisecond,
			2500 * time.Millisecond,
		}
		for _, delay := range delays {
			time.Sleep(delay)
			scheduleDisarm()
		}

		ticker := time.NewTicker(3 * time.Second)
		defer ticker.Stop()
		for i := 0; i < 20; i++ {
			<-ticker.C
			scheduleDisarm()
		}
	}()
}
