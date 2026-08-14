/*
 * CanvMgr.js
 *
 * Canvas manager for a 2D top-down world.
 *
 * Features:
 *   - Automatic canvas resizing
 *   - Device-pixel-ratio aware rendering
 *   - Infinite-ish world coordinates
 *   - Camera position
 *   - Zoom
 *   - Mouse-wheel zooming around the cursor
 *   - Middle-mouse / right-mouse panning
 *   - Optional left-mouse panning
 *   - World -> screen conversion
 *   - Screen -> world conversion
 *   - World rendering
 *   - HUD rendering
 *   - Render layers
 *   - World clipping
 *   - Camera bounds
 *   - Grid rendering
 *   - Point/rectangle helpers
 *   - Animation loop
 *
 * Coordinate system:
 *
 *   World:
 *       X+ = EAST
 *       Y+ = NORTH
 *
 * Screen:
 *       X+ = RIGHT
 *       Y+ = DOWN
 *
 * Therefore the world Y axis is flipped when rendered.
 *
 * Example:
 *
 *   const canvas = document.querySelector("#game");
 *
 *   const mgr = new CanvMgr(canvas, {
 *       zoom: 1,
 *       minZoom: 0.05,
 *       maxZoom: 20
 *   });
 *
 *   mgr.addWorldLayer("world", (ctx, camera) => {
 *       ctx.fillStyle = "#333";
 *       ctx.fillRect(-5000, -5000, 10000, 10000);
 *
 *       ctx.fillStyle = "red";
 *       mgr.drawWorldCircle(ctx, 100, 200, 20);
 *   });
 *
 *   mgr.addHudLayer("hud", (ctx) => {
 *       ctx.fillStyle = "white";
 *       ctx.font = "16px sans-serif";
 *       ctx.fillText(
 *           "Zoom: " + mgr.zoom.toFixed(2),
 *           10,
 *           24
 *       );
 *   });
 *
 *   mgr.start();
 */

export default class CanvMgr {
    constructor(canvas, options = {}) {
        if (!(canvas instanceof HTMLCanvasElement)) {
            throw new TypeError(
                "CanvMgr requires an HTMLCanvasElement."
            );
        }

        this.canvas = canvas;

        this.ctx = canvas.getContext("2d", {
            alpha: options.alpha ?? true,
            desynchronized: options.desynchronized ?? false
        });

        if (!this.ctx) {
            throw new Error("Could not acquire 2D canvas context.");
        }

        this.options = {
            background:
                options.background ??
                null,

            minZoom:
                options.minZoom ??
                0.05,

            maxZoom:
                options.maxZoom ??
                20,

            zoom:
                options.zoom ??
                1,

            panSpeed:
                options.panSpeed ??
                1,

            wheelZoomSpeed:
                options.wheelZoomSpeed ??
                0.0015,

            enableMousePan:
                options.enableMousePan ??
                true,

            allowLeftButtonPan:
                options.allowLeftButtonPan ??
                false,

            allowRightButtonPan:
                options.allowRightButtonPan ??
                true,

            allowMiddleButtonPan:
                options.allowMiddleButtonPan ??
                true,

            enableWheelZoom:
                options.enableWheelZoom ??
                true,

            enableGrid:
                options.enableGrid ??
                false,

            gridSize:
                options.gridSize ??
                100,

            gridMinorDivisions:
                options.gridMinorDivisions ??
                10,

            gridColor:
                options.gridColor ??
                "rgba(255,255,255,0.08)",

            gridMinorColor:
                options.gridMinorColor ??
                "rgba(255,255,255,0.035)",

            axisColor:
                options.axisColor ??
                "rgba(255,255,255,0.25)",

            pixelated:
                options.pixelated ??
                false,

            clearColor:
                options.clearColor ??
                "#000000"
        };

        this.zoom = this.clampZoom(this.options.zoom);

        /*
         * Camera position in WORLD coordinates.
         *
         * camera.x / camera.y is the point currently at the center
         * of the canvas.
         */
        this.camera = {
            x: options.cameraX ?? 0,
            y: options.cameraY ?? 0
        };

        /*
         * Actual CSS/display size.
         */
        this.width = 1;
        this.height = 1;

        /*
         * Backing resolution scale.
         */
        this.dpr = 1;

        /*
         * Animation state.
         */
        this.running = false;
        this.animationFrame = 0;
        this.lastTime = 0;
        this.deltaTime = 0;
        this.elapsedTime = 0;
        this.frameCount = 0;

        /*
         * Render layers.
         */
        this.worldLayers = [];
        this.hudLayers = [];

        /*
         * Input state.
         */
        this.input = {
            pointerX: 0,
            pointerY: 0,

            pointerDown: false,
            button: -1,

            dragging: false,

            dragStartX: 0,
            dragStartY: 0,

            dragCameraX: 0,
            dragCameraY: 0,

            wheelDelta: 0,

            shift: false,
            ctrl: false,
            alt: false
        };

        /*
         * Optional callbacks.
         */
        this.onResize = null;
        this.onPointerDown = null;
        this.onPointerUp = null;
        this.onPointerMove = null;
        this.onWheel = null;

        this.resizeObserver = null;

        this.bindEvents();
        this.setupResizeObserver();
        this.resize();
    }

    // ================================================================
    // Initialization
    // ================================================================

    bindEvents() {
        this._onPointerDown = (event) => {
            this.input.pointerDown = true;
            this.input.button = event.button;

            this.input.pointerX = event.offsetX;
            this.input.pointerY = event.offsetY;

            this.input.dragStartX = event.offsetX;
            this.input.dragStartY = event.offsetY;

            this.input.dragCameraX = this.camera.x;
            this.input.dragCameraY = this.camera.y;

            if (
                this.options.enableMousePan &&
                this.isPanButton(event.button)
            ) {
                this.input.dragging = true;

                this.canvas.setPointerCapture(
                    event.pointerId
                );

                event.preventDefault();
            }

            if (this.onPointerDown) {
                this.onPointerDown(event, this);
            }
        };

        this._onPointerUp = (event) => {
            this.input.pointerDown = false;
            this.input.button = -1;
            this.input.dragging = false;

            if (this.canvas.hasPointerCapture(event.pointerId)) {
                this.canvas.releasePointerCapture(
                    event.pointerId
                );
            }

            if (this.onPointerUp) {
                this.onPointerUp(event, this);
            }
        };

        this._onPointerMove = (event) => {
            this.input.pointerX = event.offsetX;
            this.input.pointerY = event.offsetY;

            if (this.input.dragging) {
                const dx =
                    event.offsetX -
                    this.input.dragStartX;

                const dy =
                    event.offsetY -
                    this.input.dragStartY;

                /*
                 * Screen Y points downward, while world Y points
                 * north/upward. Therefore the Y camera motion is
                 * inverted.
                 */
                this.camera.x =
                    this.input.dragCameraX -
                    dx / this.zoom *
                    this.options.panSpeed;

                this.camera.y =
                    this.input.dragCameraY +
                    dy / this.zoom *
                    this.options.panSpeed;
            }

            if (this.onPointerMove) {
                this.onPointerMove(event, this);
            }
        };

        this._onWheel = (event) => {
            if (!this.options.enableWheelZoom) {
                return;
            }

            event.preventDefault();

            const mouseX = event.offsetX;
            const mouseY = event.offsetY;

            /*
             * Find the world point currently underneath the cursor.
             */
            const before = this.screenToWorld(
                mouseX,
                mouseY
            );

            /*
             * Exponential zoom feels considerably less horrible
             * than linearly adding wheelDelta.
             */
            const factor = Math.exp(
                -event.deltaY *
                this.options.wheelZoomSpeed
            );

            this.setZoom(
                this.zoom * factor,
                mouseX,
                mouseY
            );

            /*
             * setZoom() keeps "before" under the cursor.
             */
            void before;

            this.input.wheelDelta += event.deltaY;

            if (this.onWheel) {
                this.onWheel(event, this);
            }
        };

        this._onContextMenu = (event) => {
            /*
             * Right mouse is normally our pan button.
             * Don't open the browser menu.
             */
            if (this.options.allowRightButtonPan) {
                event.preventDefault();
            }
        };

        this._onPointerLeave = () => {
            /*
             * Do not reset the pointer coordinates. They remain useful
             * to code querying the manager immediately after leaving.
             */
        };

        this.canvas.addEventListener(
            "pointerdown",
            this._onPointerDown
        );

        this.canvas.addEventListener(
            "pointerup",
            this._onPointerUp
        );

        this.canvas.addEventListener(
            "pointercancel",
            this._onPointerUp
        );

        this.canvas.addEventListener(
            "pointermove",
            this._onPointerMove
        );

        this.canvas.addEventListener(
            "wheel",
            this._onWheel,
            { passive: false }
        );

        this.canvas.addEventListener(
            "contextmenu",
            this._onContextMenu
        );

        this.canvas.addEventListener(
            "pointerleave",
            this._onPointerLeave
        );

        /*
         * Allows keyboard modifier state to be queried.
         */
        this._onKeyDown = (event) => {
            this.input.shift = event.shiftKey;
            this.input.ctrl = event.ctrlKey;
            this.input.alt = event.altKey;
        };

        this._onKeyUp = (event) => {
            this.input.shift = event.shiftKey;
            this.input.ctrl = event.ctrlKey;
            this.input.alt = event.altKey;
        };

        window.addEventListener(
            "keydown",
            this._onKeyDown
        );

        window.addEventListener(
            "keyup",
            this._onKeyUp
        );
    }

    setupResizeObserver() {
        if (typeof ResizeObserver === "undefined") {
            window.addEventListener(
                "resize",
                () => this.resize()
            );

            return;
        }

        this.resizeObserver = new ResizeObserver(
            () => this.resize()
        );

        this.resizeObserver.observe(
            this.canvas
        );
    }

    destroy() {
        this.stop();

        this.canvas.removeEventListener(
            "pointerdown",
            this._onPointerDown
        );

        this.canvas.removeEventListener(
            "pointerup",
            this._onPointerUp
        );

        this.canvas.removeEventListener(
            "pointercancel",
            this._onPointerUp
        );

        this.canvas.removeEventListener(
            "pointermove",
            this._onPointerMove
        );

        this.canvas.removeEventListener(
            "wheel",
            this._onWheel
        );

        this.canvas.removeEventListener(
            "contextmenu",
            this._onContextMenu
        );

        this.canvas.removeEventListener(
            "pointerleave",
            this._onPointerLeave
        );

        window.removeEventListener(
            "keydown",
            this._onKeyDown
        );

        window.removeEventListener(
            "keyup",
            this._onKeyUp
        );

        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }
    }

    // ================================================================
    // Canvas
    // ================================================================

    resize() {
        const rect = this.canvas.getBoundingClientRect();

        this.width = Math.max(
            1,
            rect.width
        );

        this.height = Math.max(
            1,
            rect.height
        );

        this.dpr = Math.max(
            1,
            window.devicePixelRatio || 1
        );

        this.canvas.width =
            Math.round(this.width * this.dpr);

        this.canvas.height =
            Math.round(this.height * this.dpr);

        /*
         * All drawing coordinates remain in CSS pixels.
         * The backing canvas is scaled for high-DPI output.
         */
        this.ctx.setTransform(
            this.dpr,
            0,
            0,
            this.dpr,
            0,
            0
        );

        if (this.options.pixelated) {
            this.canvas.style.imageRendering =
                "pixelated";
        }

        if (this.onResize) {
            this.onResize(
                this.width,
                this.height,
                this
            );
        }
    }

    clear() {
        const ctx = this.ctx;

        ctx.save();

        ctx.setTransform(
            this.dpr,
            0,
            0,
            this.dpr,
            0,
            0
        );

        if (this.options.background !== null) {
            ctx.fillStyle =
                this.options.background;

            ctx.fillRect(
                0,
                0,
                this.width,
                this.height
            );
        } else {
            ctx.clearRect(
                0,
                0,
                this.width,
                this.height
            );
        }

        ctx.restore();
    }

    // ================================================================
    // Camera
    // ================================================================

    clampZoom(value) {
        return Math.min(
            this.options.maxZoom,
            Math.max(
                this.options.minZoom,
                value
            )
        );
    }

    setZoom(
        value,
        screenX = this.width / 2,
        screenY = this.height / 2
    ) {
        const oldZoom = this.zoom;
        const newZoom = this.clampZoom(value);

        if (oldZoom === newZoom) {
            return;
        }

        /*
         * Preserve the world coordinate underneath the cursor.
         */
        const world = this.screenToWorld(
            screenX,
            screenY
        );

        this.zoom = newZoom;

        const centerX =
            screenX -
            this.width / 2;

        const centerY =
            screenY -
            this.height / 2;

        this.camera.x =
            world.x -
            centerX / this.zoom;

        this.camera.y =
            world.y +
            centerY / this.zoom;
    }

    zoomBy(
        factor,
        screenX = this.width / 2,
        screenY = this.height / 2
    ) {
        this.setZoom(
            this.zoom * factor,
            screenX,
            screenY
        );
    }

    pan(dx, dy) {
        /*
         * dx/dy are WORLD units.
         */
        this.camera.x += dx;
        this.camera.y += dy;
    }

    setCamera(x, y) {
        this.camera.x = x;
        this.camera.y = y;
    }

    centerCameraOn(x, y) {
        this.setCamera(x, y);
    }

    // ================================================================
    // Camera/world transforms
    // ================================================================

    worldToScreen(x, y) {
        return {
            x:
                (x - this.camera.x) *
                this.zoom +
                this.width / 2,

            y:
                (this.camera.y - y) *
                this.zoom +
                this.height / 2
        };
    }

    screenToWorld(x, y) {
        return {
            x:
                this.camera.x +
                (x - this.width / 2) /
                this.zoom,

            y:
                this.camera.y -
                (y - this.height / 2) /
                this.zoom
        };
    }

    worldRectToScreen(x, y, width, height) {
        const p = this.worldToScreen(x, y);

        return {
            x: p.x,
            y: p.y - height * this.zoom,
            width: width * this.zoom,
            height: height * this.zoom
        };
    }

    // ================================================================
    // Render layers
    // ================================================================

    addWorldLayer(name, renderer) {
        if (typeof renderer !== "function") {
            throw new TypeError(
                "World layer renderer must be a function."
            );
        }

        const layer = {
            name,
            renderer,
            enabled: true
        };

        this.worldLayers.push(layer);

        return layer;
    }

    addHudLayer(name, renderer) {
        if (typeof renderer !== "function") {
            throw new TypeError(
                "HUD layer renderer must be a function."
            );
        }

        const layer = {
            name,
            renderer,
            enabled: true
        };

        this.hudLayers.push(layer);

        return layer;
    }

    removeWorldLayer(layerOrName) {
        this.worldLayers =
            this.worldLayers.filter(
                layer =>
                    layer !== layerOrName &&
                    layer.name !== layerOrName
            );
    }

    removeHudLayer(layerOrName) {
        this.hudLayers =
            this.hudLayers.filter(
                layer =>
                    layer !== layerOrName &&
                    layer.name !== layerOrName
            );
    }

    // ================================================================
    // Rendering
    // ================================================================

    render() {
        const ctx = this.ctx;

        this.clear();

        /*
         * WORLD
         */
        ctx.save();

        /*
         * Transform world coordinates into screen coordinates:
         *
         * screen = translate(center)
         *        + scale(zoom, -zoom)
         *        + translate(-camera)
         */
        ctx.setTransform(
            this.dpr * this.zoom,
            0,
            0,
            -this.dpr * this.zoom,
            this.dpr *
                (
                    this.width / 2 -
                    this.camera.x *
                    this.zoom
                ),
            this.dpr *
                (
                    this.height / 2 +
                    this.camera.y *
                    this.zoom
                )
        );

        if (this.options.enableGrid) {
            this.renderGrid(ctx);
        }

        for (const layer of this.worldLayers) {
            if (!layer.enabled) {
                continue;
            }

            layer.renderer(
                ctx,
                this
            );
        }

        ctx.restore();

        /*
         * HUD.
         *
         * Reset to ordinary screen coordinates.
         */
        ctx.save();

        ctx.setTransform(
            this.dpr,
            0,
            0,
            this.dpr,
            0,
            0
        );

        for (const layer of this.hudLayers) {
            if (!layer.enabled) {
                continue;
            }

            layer.renderer(
                ctx,
                this
            );
        }

        ctx.restore();
    }

    // ================================================================
    // Grid
    // ================================================================

    renderGrid(ctx) {
        const visible = this.getVisibleWorldRect();

        const major =
            this.options.gridSize;

        const minor =
            major /
            Math.max(
                1,
                this.options.gridMinorDivisions
            );

        /*
         * Minor grid.
         */
        if (
            minor * this.zoom >= 4
        ) {
            ctx.strokeStyle =
                this.options.gridMinorColor;

            ctx.lineWidth =
                1 / this.zoom;

            const startX =
                Math.floor(
                    visible.x /
                    minor
                ) * minor;

            const endX =
                Math.ceil(
                    (
                        visible.x +
                        visible.width
                    ) / minor
                ) * minor;

            for (
                let x = startX;
                x <= endX;
                x += minor
            ) {
                ctx.beginPath();
                ctx.moveTo(
                    x,
                    visible.y
                );
                ctx.lineTo(
                    x,
                    visible.y +
                    visible.height
                );
                ctx.stroke();
            }

            const startY =
                Math.floor(
                    visible.y /
                    minor
                ) * minor;

            const endY =
                Math.ceil(
                    (
                        visible.y +
                        visible.height
                    ) / minor
                ) * minor;

            for (
                let y = startY;
                y <= endY;
                y += minor
            ) {
                ctx.beginPath();
                ctx.moveTo(
                    visible.x,
                    y
                );
                ctx.lineTo(
                    visible.x +
                    visible.width,
                    y
                );
                ctx.stroke();
            }
        }

        /*
         * Major grid.
         */
        ctx.strokeStyle =
            this.options.gridColor;

        ctx.lineWidth =
            1 / this.zoom;

        const startMajorX =
            Math.floor(
                visible.x /
                major
            ) * major;

        const endMajorX =
            Math.ceil(
                (
                    visible.x +
                    visible.width
                ) / major
            ) * major;

        for (
            let x = startMajorX;
            x <= endMajorX;
            x += major
        ) {
            ctx.beginPath();
            ctx.moveTo(x, visible.y);
            ctx.lineTo(
                x,
                visible.y +
                visible.height
            );
            ctx.stroke();
        }

        const startMajorY =
            Math.floor(
                visible.y /
                major
            ) * major;

        const endMajorY =
            Math.ceil(
                (
                    visible.y +
                    visible.height
                ) / major
            ) * major;

        for (
            let y = startMajorY;
            y <= endMajorY;
            y += major
        ) {
            ctx.beginPath();
            ctx.moveTo(
                visible.x,
                y
            );
            ctx.lineTo(
                visible.x +
                visible.width,
                y
            );
            ctx.stroke();
        }

        /*
         * World axes.
         */
        ctx.strokeStyle =
            this.options.axisColor;

        ctx.lineWidth =
            2 / this.zoom;

        ctx.beginPath();
        ctx.moveTo(0, visible.y);
        ctx.lineTo(
            0,
            visible.y +
            visible.height
        );
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(visible.x, 0);
        ctx.lineTo(
            visible.x +
            visible.width,
            0
        );
        ctx.stroke();
    }

    // ================================================================
    // Visible world area
    // ================================================================

    getVisibleWorldRect() {
        const topLeft =
            this.screenToWorld(
                0,
                0
            );

        const bottomRight =
            this.screenToWorld(
                this.width,
                this.height
            );

        return {
            x: topLeft.x,

            y: bottomRight.y,

            width:
                bottomRight.x -
                topLeft.x,

            height:
                topLeft.y -
                bottomRight.y
        };
    }

    isWorldPointVisible(x, y, margin = 0) {
        const rect =
            this.getVisibleWorldRect();

        return (
            x >= rect.x - margin &&
            x <=
                rect.x +
                rect.width +
                margin &&
            y >= rect.y - margin &&
            y <=
                rect.y +
                rect.height +
                margin
        );
    }

    isWorldRectVisible(
        x,
        y,
        width,
        height,
        margin = 0
    ) {
        const rect =
            this.getVisibleWorldRect();

        return !(
            x + width <
                rect.x - margin ||
            x >
                rect.x +
                rect.width +
                margin ||
            y + height <
                rect.y - margin ||
            y >
                rect.y +
                rect.height +
                margin
        );
    }

    // ================================================================
    // Drawing helpers
    // ================================================================

    drawWorldPoint(
        ctx,
        x,
        y,
        radius,
        fillStyle
    ) {
        ctx.save();

        ctx.beginPath();
        ctx.arc(
            x,
            y,
            radius,
            0,
            Math.PI * 2
        );

        if (fillStyle !== undefined) {
            ctx.fillStyle = fillStyle;
        }

        ctx.fill();

        ctx.restore();
    }

    drawWorldCircle(
        ctx,
        x,
        y,
        radius,
        fillStyle,
        strokeStyle = null,
        lineWidth = 1
    ) {
        ctx.save();

        ctx.beginPath();

        ctx.arc(
            x,
            y,
            radius,
            0,
            Math.PI * 2
        );

        if (fillStyle !== null) {
            ctx.fillStyle = fillStyle;
            ctx.fill();
        }

        if (strokeStyle !== null) {
            ctx.strokeStyle = strokeStyle;

            ctx.lineWidth =
                lineWidth;

            ctx.stroke();
        }

        ctx.restore();
    }

    drawWorldRect(
        ctx,
        x,
        y,
        width,
        height,
        fillStyle,
        strokeStyle = null,
        lineWidth = 1
    ) {
        ctx.save();

        /*
         * In this coordinate system x/y describe the
         * bottom-left corner of the rectangle.
         *
         * Canvas world Y is already flipped by the camera transform,
         * so this produces the expected top-down orientation.
         */
        ctx.beginPath();

        ctx.rect(
            x,
            y,
            width,
            height
        );

        if (fillStyle !== null) {
            ctx.fillStyle = fillStyle;
            ctx.fill();
        }

        if (strokeStyle !== null) {
            ctx.strokeStyle =
                strokeStyle;

            ctx.lineWidth =
                lineWidth;

            ctx.stroke();
        }

        ctx.restore();
    }

    drawWorldLine(
        ctx,
        x1,
        y1,
        x2,
        y2,
        strokeStyle,
        lineWidth = 1
    ) {
        ctx.save();

        ctx.strokeStyle =
            strokeStyle;

        ctx.lineWidth =
            lineWidth;

        ctx.beginPath();

        ctx.moveTo(
            x1,
            y1
        );

        ctx.lineTo(
            x2,
            y2
        );

        ctx.stroke();

        ctx.restore();
    }

    drawWorldText(
        ctx,
        text,
        x,
        y,
        options = {}
    ) {
        ctx.save();

        /*
         * The world transform flips Y.
         *
         * For readable text, undo the Y flip locally.
         */
        ctx.translate(
            x,
            y
        );

        ctx.scale(
            1,
            -1
        );

        ctx.font =
            options.font ??
            "14px sans-serif";

        ctx.fillStyle =
            options.fillStyle ??
            "#ffffff";

        ctx.textAlign =
            options.textAlign ??
            "left";

        ctx.textBaseline =
            options.textBaseline ??
            "alphabetic";

        ctx.fillText(
            text,
            options.offsetX ?? 0,
            options.offsetY ?? 0
        );

        ctx.restore();
    }

    // ================================================================
    // HUD helpers
    // ================================================================

    drawHudText(
        ctx,
        text,
        x,
        y,
        options = {}
    ) {
        ctx.save();

        ctx.font =
            options.font ??
            "14px sans-serif";

        ctx.fillStyle =
            options.fillStyle ??
            "#ffffff";

        ctx.textAlign =
            options.textAlign ??
            "left";

        ctx.textBaseline =
            options.textBaseline ??
            "top";

        ctx.fillText(
            text,
            x,
            y
        );

        ctx.restore();
    }

    drawHudRect(
        ctx,
        x,
        y,
        width,
        height,
        fillStyle,
        strokeStyle = null,
        lineWidth = 1
    ) {
        ctx.save();

        if (fillStyle !== null) {
            ctx.fillStyle =
                fillStyle;

            ctx.fillRect(
                x,
                y,
                width,
                height
            );
        }

        if (strokeStyle !== null) {
            ctx.strokeStyle =
                strokeStyle;

            ctx.lineWidth =
                lineWidth;

            ctx.strokeRect(
                x,
                y,
                width,
                height
            );
        }

        ctx.restore();
    }

    // ================================================================
    // Input helpers
    // ================================================================

    isPanButton(button) {
        if (button === 0) {
            return this.options.allowLeftButtonPan;
        }

        if (button === 1) {
            return this.options.allowMiddleButtonPan;
        }

        if (button === 2) {
            return this.options.allowRightButtonPan;
        }

        return false;
    }

    getMouseWorldPosition() {
        return this.screenToWorld(
            this.input.pointerX,
            this.input.pointerY
        );
    }

    getMouseScreenPosition() {
        return {
            x: this.input.pointerX,
            y: this.input.pointerY
        };
    }

    // ================================================================
    // Animation
    // ================================================================

    start() {
        if (this.running) {
            return;
        }

        this.running = true;
        this.lastTime = performance.now();

        const frame = (time) => {
            if (!this.running) {
                return;
            }

            const dt =
                (time - this.lastTime) /
                1000;

            this.lastTime = time;

            /*
             * Prevent a huge timestep after tab suspension.
             */
            this.deltaTime =
                Math.min(
                    dt,
                    0.1
                );

            this.elapsedTime +=
                this.deltaTime;

            this.frameCount++;

            this.update(
                this.deltaTime
            );

            this.render();

            this.animationFrame =
                requestAnimationFrame(frame);
        };

        this.animationFrame =
            requestAnimationFrame(frame);
    }

    stop() {
        if (!this.running) {
            return;
        }

        this.running = false;

        cancelAnimationFrame(
            this.animationFrame
        );

        this.animationFrame = 0;
    }

    update(deltaTime) {
        /*
         * Override this or assign:
         *
         * mgr.update = (dt) => { ... };
         */
        void deltaTime;
    }

    // ================================================================
    // Utility
    // ================================================================

    getDimensions() {
        return {
            width: this.width,
            height: this.height,
            dpr: this.dpr
        };
    }

    getCamera() {
        return {
            x: this.camera.x,
            y: this.camera.y,
            zoom: this.zoom
        };
    }
}


