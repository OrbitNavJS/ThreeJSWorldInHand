import {
	FloatType,
	Mesh,
	PerspectiveCamera,
	PlaneGeometry,
	Scene,
	ShaderMaterial,
	Vector2,
	Vector3,
	WebGLRenderTarget,
	WebGLRenderer,
	RGBAFormat,
	Matrix4,
	Plane,
	Ray,
	Box3,
	Sphere,
	DepthFormat,
	DepthTexture,
	Object3D,
	Material
} from 'three';
import { WorldInHandControlsVisualiser } from './worldInHandControlsVisualiser';

export class WorldInHandControls extends EventTarget {
	/**
	 * Render whatever you actually want to navigate on into this RenderTarget.
	 */
	readonly navigationRenderTarget: WebGLRenderTarget;
	protected domElement: HTMLCanvasElement;
	protected renderer: WebGLRenderer;
	protected actualScene: Scene;

	protected camera: PerspectiveCamera;
	protected depthBufferScene!: Scene;
	protected copyPlaneScene!: Scene;
	protected depthBufferRenderTarget: WebGLRenderTarget;

	protected depthBufferPlaneMaterial!: ShaderMaterial;
	protected copyPlaneMaterial!: ShaderMaterial;

	/*
	Navigation state
	 */

	protected pointers: Array<PointerEvent> = [];
	protected previousPointers: Array<PointerEvent> = [];

	protected mousePosition = new Vector2();
	protected mouseWorldPosition = new Vector3();
	protected cameraLookAt = new Vector3();

	protected zoomDirection = new Vector3();
	protected rotateStart = new Vector2();
	protected rotateEnd = new Vector2();
	protected rotateDelta = new Vector2();
	protected panStart = new Vector3();
	protected panHeightGuide = new Plane();

	protected mouseButtonConfiguration = { pan: 2, rotate: 0 };

	/*
	Reset functionality
	 */

	protected originalCameraPosition: Vector3;
	protected originalCameraLookAt: Vector3;

	/*
	Configuration variables
	 */

	// camera up-vector has to be the y-axis for now
	protected cameraUpVector = new Vector3(0, 1, 0);
	protected _useBottomOfBoundingBoxAsGroundPlane = true;
	protected _allowRotationBelowGroundPlane = true;
	protected _rotateAroundMousePosition = false;

	/*
	Navigation resilience
	 */

	protected angleToUpVector!: number;
	protected maxLowerRotationAngle!: number;
	protected maxPanZoomDistance!: number;
	protected groundPlaneHeight!: number;
	protected groundPlane = new Plane();
	protected boundingDepthNDC!: number;
	protected sceneBackPoint = new Vector3();
	protected boundingSphere = new Sphere();
	protected nearPlane = new Plane();

	protected sceneHasMesh = false;
	protected hasWarnedAboutEmptyScene = false;

	/*
	Debug
	 */

	protected _visualiser: WorldInHandControlsVisualiser | undefined;

	/**
	 * @param camera The camera to navigate.
	 * @param domElement The canvas to listen for events on.
	 * @param renderer The renderer to render with.
	 * @param scene The scene to navigate in.
	 * @param lookAtSceneCenter Whether camera lookAt should be scene center. Defaults to false, meaning (0, 0, 0).
	 * @param msaaSamples The number of samples for the navigationRenderTarget. Default is 4.
	 */
	constructor(camera: PerspectiveCamera, domElement: HTMLCanvasElement, renderer: WebGLRenderer, scene: Scene, lookAtSceneCenter: boolean = false, msaaSamples: number = 4) {
		super();

		this.camera = camera;
		this.domElement = domElement;
		this.domElement.style.touchAction = 'none'; // disable scrolling on touch
		this.renderer = renderer;
		this.actualScene = scene;

		this.navigationRenderTarget = new WebGLRenderTarget(1, 1, { samples: msaaSamples });
		this.navigationRenderTarget.depthTexture = new DepthTexture(1, 1, FloatType);
		this.navigationRenderTarget.depthTexture.format = DepthFormat;

		this.depthBufferRenderTarget = new WebGLRenderTarget(1, 1, {format: RGBAFormat, type: FloatType});
		this.updateRenderTargets();

		this.setupRenderGeometries();

		this.setupResilience();

		this.actualScene.addEventListener('change', this.setupBoundingSphereBound);
		this.actualScene.addEventListener('resize', this.updateRenderTargetsBound);

		this.domElement.addEventListener('pointerdown', this.onPointerDownBound, { passive: false });
		this.domElement.addEventListener('pointercancel', this.onPointerUpBound);
		this.domElement.addEventListener('wheel', this.onMouseWheelBound, { passive: false });
		this.domElement.addEventListener('contextmenu', this.preventContextMenu);

		if (lookAtSceneCenter)
			this.reloadCamera(this.boundingSphere.center);
		else 
			this.camera.lookAt(0, 0, 0);

		this.originalCameraPosition = this.camera.position.clone();
		this.originalCameraLookAt = this.cameraLookAt.clone();
	}

	/*
	Actual navigation
	 */

	protected zoom(direction: number): void {
		if (isNaN(direction)) return;

		this.zoomDirection.copy(this.mouseWorldPosition).sub(this.camera.position);

		// prevent zooms that put geometry between camera near plane and camera
		const cameraZAxisWorld = this.camera.getWorldDirection(new Vector3());
		this.nearPlane.setFromNormalAndCoplanarPoint(cameraZAxisWorld, this.camera.position.clone().addScaledVector(cameraZAxisWorld, this.camera.near * 1.1));

		const distanceToNearPlane = this.nearPlane.distanceToPoint(this.mouseWorldPosition);

		const nearPlaneRatio = distanceToNearPlane / this.zoomDirection.length();
		this.zoomDirection.multiplyScalar(nearPlaneRatio);

		// make zooming in, then zooming out have the same camera distance as before
		if (direction < 0) this.zoomDirection.multiplyScalar(0.33 * direction);
		else this.zoomDirection.multiplyScalar(0.25 * direction);

		// prevent zooming scene too far away
		const nextCameraPosition = this.camera.position.clone().add(this.zoomDirection);
		if (nextCameraPosition.length() > this.maxPanZoomDistance
			// prevent zoom through ground plane
			|| ((nextCameraPosition.y - this.groundPlaneHeight) / (this.camera.position.y - this.groundPlaneHeight)) < 0) return;

		this.camera.position.copy(nextCameraPosition);
		this.camera.updateMatrixWorld(true);

		const depth = this.readDepthAtPosition(0, 0);
		this.cameraLookAt.copy(new Vector3(0, 0, depth).unproject(this.camera));

		const scalingFactor = -this.camera.position.y / (this.cameraLookAt.y - this.camera.position.y);
		// Height of camera reference point should not change
		const intersectionXZ = this.camera.position.clone().add(this.cameraLookAt.clone().sub(this.camera.position).multiplyScalar(scalingFactor));
		this.cameraLookAt.copy(intersectionXZ);

		this.updateFurthestSceneDepth();
		this._visualiser?.update({ maxNavigationSphereCenter: this.camera.position });
		if (!this._rotateAroundMousePosition) this._visualiser?.update({ rotationCenter: this.cameraLookAt });
	}

	protected rotate(delta: Vector2): void {
		const rotationCenter = this._rotateAroundMousePosition ? this.mouseWorldPosition : this.cameraLookAt;
		const rotationCenterToCamera = this.camera.position.clone().sub(rotationCenter);
		const cameraToCameraLookAt = this.cameraLookAt.clone().sub(this.camera.position);

		const cameraXAxis = new Vector3().crossVectors(this.camera.getWorldDirection(new Vector3()).negate(), this.cameraUpVector).normalize();
		const rotationMatrix = new Matrix4().makeRotationY(-delta.x);

		// prevent illegal rotation of the camera onto the y-axis (i.e., the up-vector)
		let nextAngleToYAxis = this.angleToUpVector - delta.y;
		nextAngleToYAxis = Math.max(Math.min(nextAngleToYAxis, this.maxLowerRotationAngle), 0.001);
		const rotationDelta = this.angleToUpVector - nextAngleToYAxis;
		rotationMatrix.multiply(new Matrix4().makeRotationAxis(cameraXAxis, rotationDelta));

		rotationCenterToCamera.applyMatrix4(rotationMatrix);
		cameraToCameraLookAt.applyMatrix4(rotationMatrix);
		this.camera.position.copy(rotationCenter.clone().add(rotationCenterToCamera));
		this.cameraLookAt.copy(this.camera.position.clone().add(cameraToCameraLookAt));

		this.camera.updateMatrixWorld(true);

		this.camera.lookAt(this.cameraLookAt);

		if (this._rotateAroundMousePosition) this.setupAngleToCameraUp();
		else this.angleToUpVector = nextAngleToYAxis;
		this.updateFurthestSceneDepth();
		this._visualiser?.update({ rotationCenter: rotationCenter });
	}

	protected pan(delta: Vector3): void {
		delta.negate();

		// prevent illegal pan
		const nextCameraPosition = this.camera.position.clone().add(delta);
		if (nextCameraPosition.clone().sub(this.boundingSphere.center).length() > this.maxPanZoomDistance) return;
		
		this.camera.position.copy(nextCameraPosition);
		this.cameraLookAt.add(delta);

		this.camera.updateMatrixWorld(true);

		// update furthest scene depth in camera coordinates
		this.updateFurthestSceneDepth();
		this._visualiser?.update({ maxNavigationSphereCenter: this.camera.position });
		if (!this._rotateAroundMousePosition) this._visualiser?.update({ rotationCenter: this.cameraLookAt });
	}

	/*
	Event handlers
	 */

	protected onMouseWheelBound = this.onMouseWheel.bind(this);
	protected onMouseWheel(event: WheelEvent): void {
		if (!this.sceneHasMesh) this.warnAboutEmptyScene();

		this.dispatchEvent(new Event('changeStart'));

		event.preventDefault();
		this.handleMouseWheel(event);
	}

	protected onPointerDownBound = this.onPointerDown.bind(this);
	protected onPointerDown(event: PointerEvent): void {
		if (!this.sceneHasMesh) this.warnAboutEmptyScene();

		this.dispatchEvent(new Event('changeStart'));

		this.domElement.removeEventListener('pointermove', this.handlePointerMovePanBound);
		this.domElement.removeEventListener('pointermove', this.handlePointerMoveRotateBound);
		this.domElement.removeEventListener('pointermove', this.handleTouchMoveZoomRotateBound);

		this.domElement.addEventListener('pointerup', this.onPointerUpBound);
		this.domElement.setPointerCapture(event.pointerId);

		if (event.pointerType === 'touch') {
			this.trackPointer(event);

			switch (this.pointers.length) {
			case 1:
				this.handlePointerDownPan(event);
				this.domElement.addEventListener('pointermove', this.handlePointerMovePanBound);
				break;
			case 2:
				this.handlePointerDownRotate(event);
				// no special handling for touch down zoom required
				this.domElement.addEventListener('pointermove', this.handleTouchMoveZoomRotateBound);
				break;
			}
		} else {
			switch (event.button) {
			// left mouse
			case this.mouseButtonConfiguration.rotate:
				this.handlePointerDownRotate(event);
				this.domElement.addEventListener('pointermove', this.handlePointerMoveRotateBound);
				break;

			// right mouse
			case this.mouseButtonConfiguration.pan:
				this.handlePointerDownPan(event);
				this.domElement.addEventListener('pointermove', this.handlePointerMovePanBound);
				break;
			}
		}
	}

	protected onPointerUpBound = this.onPointerUp.bind(this);
	protected onPointerUp( event: PointerEvent ) {
		if (event.pointerType === 'touch') this.removePointer( event );

		this.domElement.releasePointerCapture( event.pointerId );
		this.domElement.removeEventListener('pointermove', this.handlePointerMovePanBound);
		this.domElement.removeEventListener('pointermove', this.handlePointerMoveRotateBound);
		this.domElement.removeEventListener('pointermove', this.handleTouchMoveZoomRotateBound);

		// always true for mouse events
		if (this.pointers.length === 0) {
			this.domElement.removeEventListener('pointerup', this.onPointerUpBound);
			this.dispatchEvent(new Event('changeEnd'));
		}
		// call onPointerDown to enable panning when removing only one finger
		else this.onPointerDown(this.pointers[0]);
	}

	protected handleMouseWheelBound = this.handleMouseWheel.bind(this);
	protected handleMouseWheel(event: WheelEvent): void {
		if (event.deltaY === 0) return;

		this.updateMouseParameters(event.clientX, event.clientY);

		this.zoom(-(event.deltaY / Math.abs(event.deltaY)));

		this.dispatchEvent(new Event('change'));
		this.dispatchEvent(new Event('changeEnd'));
	}

	protected handlePointerDownRotateBound = this.handlePointerDownRotate.bind(this);
	protected handlePointerDownRotate(event: PointerEvent): void {
		const averagePointerPosition = this.getAveragePointerPosition(event);
		if (averagePointerPosition === null) return;
		this.updateMouseParameters(averagePointerPosition.x, averagePointerPosition.y);

		this.rotateStart.copy(averagePointerPosition);
	}

	protected handlePointerMoveRotateBound = this.handlePointerMoveRotate.bind(this);
	protected handlePointerMoveRotate(event: PointerEvent): void {
		const averagePointerPosition = this.getAveragePointerPosition(event);
		if (averagePointerPosition === null) return;
		this.rotateEnd.copy(averagePointerPosition);

		const rendererSize = this.renderer.getSize(new Vector2());
		const minSideSize = Math.min(rendererSize.x, rendererSize.y);
		this.rotateDelta.subVectors(this.rotateEnd, this.rotateStart).divideScalar(minSideSize / 2);

		this.rotate(this.rotateDelta);

		this.rotateStart.copy(this.rotateEnd);
		this.dispatchEvent(new Event('change'));
	}

	protected handlePointerDownPanBound = this.handlePointerDownPan.bind(this);
	protected handlePointerDownPan(event: PointerEvent): void {
		this.updateMouseParameters(event.clientX, event.clientY);

		this.panStart.copy(this.mouseWorldPosition);
		// use negative y to make plane have positive y
		this.panHeightGuide.copy(new Plane(this.cameraUpVector, -this.panStart.y));
		this._visualiser?.update({ panHeightGuideHeight: this.panStart.y });
	}

	protected handlePointerMovePanBound = this.handlePointerMovePan.bind(this);
	protected handlePointerMovePan(event: PointerEvent): void {
		this.updateMouseParameters(event.clientX, event.clientY);

		const mouseRay = new Ray(this.camera.position, this.mouseWorldPosition.clone().sub(this.camera.position).normalize());
		const panCurrent = new Vector3();

		// ignore if no intersection with height guide plane can be found
		if (mouseRay.intersectPlane(this.panHeightGuide, panCurrent) === null) return;

		this.pan(panCurrent.clone().sub(this.panStart));

		this.dispatchEvent(new Event('change'));
	}

	protected handleTouchMoveZoomRotateBound = this.handleTouchMoveZoomRotate.bind(this);
	protected handleTouchMoveZoomRotate(event: PointerEvent) {
		this.trackPointer(event);

		this.handlePointerMoveRotate(event);
		this.handleTouchMoveZoom(event);
		this.dispatchEvent(new Event('change'));
	}

	protected handleTouchMoveZoomBound = this.handleTouchMoveZoom.bind(this);
	protected handleTouchMoveZoom(event: PointerEvent) {
		const otherPointer = this.getOtherPointer(event);
		if (otherPointer === null) return;

		const averageX = (event.clientX + otherPointer.clientX) / 2;
		const averageY = (event.clientY + otherPointer.clientY) / 2;
		this.updateMouseParameters(averageX, averageY);

		const currLength = new Vector2(event.clientX - otherPointer.clientX, event.clientY - otherPointer.clientY).length();
		const prevLength = new Vector2(this.previousPointers[0].clientX - this.previousPointers[1].clientX, this.previousPointers[0].clientY - this.previousPointers[1].clientY).length();
		const delta = (currLength - prevLength) / (Math.max(this.domElement.clientWidth, this.domElement.clientHeight)) * 5;

		this.zoom(delta);
		this.dispatchEvent(new Event('change'));
	}

	protected preventContextMenu(event: Event) {
		event.preventDefault();
	}

	/*
	Miscellaneous helpers
	 */

	protected setupRenderGeometries(): void {
		const planeVertexShader = `
			varying vec2 vUV;
			
			void main() {
				vUV = uv;
				gl_Position = vec4(position, 1.0);
			}
			`;

		const depthPlaneFragmentShader = `
			varying vec2 vUV;
			uniform sampler2D uDepthTexture;
			
			void main() {
				gl_FragColor = texture(uDepthTexture, vUV);
			}
			`;

		const copyPlaneFragmentShader = `
			varying vec2 vUV;
			uniform sampler2D uColorTexture;
			
			void main() {
				gl_FragColor = sRGBTransferOETF(texture(uColorTexture, vUV));
			}
			`;

		const planeGeometry = new PlaneGeometry(2, 2);

		this.depthBufferPlaneMaterial = new ShaderMaterial();
		this.depthBufferPlaneMaterial.vertexShader = planeVertexShader;
		this.depthBufferPlaneMaterial.fragmentShader = depthPlaneFragmentShader;

		const depthBufferPlane = new Mesh(planeGeometry, this.depthBufferPlaneMaterial);
		depthBufferPlane.frustumCulled = false;

		this.depthBufferScene = new Scene();
		this.depthBufferScene.add(depthBufferPlane);

		this.copyPlaneMaterial = new ShaderMaterial();
		this.copyPlaneMaterial.vertexShader = planeVertexShader;
		this.copyPlaneMaterial.fragmentShader = copyPlaneFragmentShader;

		const copyPlane = new Mesh(planeGeometry, this.copyPlaneMaterial);
		copyPlane.frustumCulled = false;

		this.copyPlaneScene = new Scene();
		this.copyPlaneScene.add(copyPlane);
	}

	/*
	Process helpers
	 */

	/**
	 * Updates the navigation with the current data in navigationRenderTarget.
	 * @param copyToCanvas Whether to copy the navigationRenderTarget to the canvas.
	 */
	public update(copyToCanvas: boolean = true): void {
		this.depthBufferPlaneMaterial.uniforms = { uDepthTexture: { value: this.navigationRenderTarget.depthTexture } };
		this.renderer.setRenderTarget(this.depthBufferRenderTarget);
		this.renderer.render(this.depthBufferScene, this.camera);

		if (!copyToCanvas) return;
		this.copyPlaneMaterial.uniforms = { uColorTexture: { value: this.navigationRenderTarget.texture } };
		this.renderer.setRenderTarget(null);
		this.renderer.render(this.copyPlaneScene, this.camera);
	}

	/**
	 * Cleans up after this navigation. Removes all registered event listeners.
	 */
	public dispose(): void {
		this.domElement.removeEventListener('pointermove', this.handlePointerMovePanBound);
		this.domElement.removeEventListener('pointermove', this.handlePointerMoveRotateBound);
		this.domElement.removeEventListener('pointermove', this.handleTouchMoveZoomRotateBound);
		this.domElement.removeEventListener('pointerup', this.onPointerUpBound);
		this.domElement.removeEventListener( 'pointerdown', this.onPointerDownBound);
		this.domElement.removeEventListener( 'pointercancel', this.onPointerUpBound);
		this.domElement.removeEventListener( 'wheel', this.onMouseWheelBound);
		this.domElement.removeEventListener( 'contextmenu', this.preventContextMenu);

		this.navigationRenderTarget.depthTexture?.dispose();
		this.navigationRenderTarget.texture.dispose();
		this.navigationRenderTarget.dispose();

		this.depthBufferPlaneMaterial.dispose();
		this.depthBufferRenderTarget.texture.dispose();
		this.depthBufferRenderTarget.dispose();

		this.copyPlaneMaterial.dispose();

		this.depthBufferScene.traverse((object: Object3D) => {
			if (object instanceof Mesh) {
				object.geometry.dispose();
				(object.material as Material).dispose();
			}
		});
		this.copyPlaneScene.traverse((object: Object3D) => {
			if (object instanceof Mesh) {
				object.geometry.dispose();
				(object.material as Material).dispose();
			}
		});
	}

	/**
	* Reloads the camera's look at position. If cameraLookAt is not provided, the look at position is set to the center of the bounding sphere.
	* @param cameraLookAt The new look at position of the camera.
	*/
	public reloadCamera(cameraLookAt?: Vector3): void {
		if (cameraLookAt !== undefined) {
			this.cameraLookAt = cameraLookAt;
		} else {
			const lookAtRay = new Ray(this.camera.position, this.camera.getWorldDirection(new Vector3()));

			if (lookAtRay.intersectPlane(this.groundPlane, this.cameraLookAt) === null) {
				this.cameraLookAt.copy(this.boundingSphere.center);
				console.warn('Could not find a valid look at position for the camera. Using the center of the bounding sphere instead.');
			}
		}

		this.camera.lookAt(this.cameraLookAt);

		this.setupAngleToCameraUp();
		this.updateFurthestSceneDepth();
		this._visualiser?.update({ maxNavigationSphereCenter: this.camera.position });
	}

	/**
	 * Resets the navigation to its original state before it received user inputs.
	 */
	public reset(): void {
		this.camera.position.copy(this.originalCameraPosition);
		this.cameraLookAt.copy(this.originalCameraLookAt);
		this.camera.lookAt(this.cameraLookAt);

		this.setupAngleToCameraUp();

		this.dispatchEvent(new Event('change'));
	}

	protected updateRenderTargetsBound = this.updateRenderTargets.bind(this);
	/**
	 * Resizes all RenderTargets to the current dimensions of renderer.
	 * @protected
	 */
	protected updateRenderTargets(): void {
		const size = this.renderer.getSize(new Vector2).multiplyScalar(this.renderer.getPixelRatio());

		this.depthBufferRenderTarget.setSize(size.x, size.y);
		this.navigationRenderTarget.setSize(size.x, size.y);
	}

	/*
	World in hand helpers
	 */

	/**
	 * Sets mousePosition to the current mouse position in NDC and sets
	 * mouseWorldPosition to the current mouse position in world coordinates.<br />
	 * <b>If the depth buffer value at the current mouse position is greater than
	 * boundingDepthNDC, boundingDepthNDC is used instead.</b>
	 */
	protected updateMouseParameters(eventX: number, eventY: number): void {
		const rect = this.domElement.getBoundingClientRect();

		const x = (eventX - rect.left);
		const y = (eventY - rect.top);
		const w = rect.width;
		const h = rect.height;

		// convert to NDC, flip y-axis in the process
		this.mousePosition.x = ( x / w ) * 2 - 1;
		this.mousePosition.y = 1 - ( y / h ) * 2;

		this.mousePosition.clamp(new Vector2(-1, -1), new Vector2(0.99, 0.99));

		const depth = this.readDepthAtPosition(this.mousePosition.x, this.mousePosition.y);
		const clampedDepth = Math.min(depth, this.boundingDepthNDC);
		this.mouseWorldPosition.set(this.mousePosition.x, this.mousePosition.y, clampedDepth);
		this.mouseWorldPosition.unproject(this.camera);
		this._visualiser?.update({ mouseWorldPosition: this.mouseWorldPosition });
	}

	/**
	 * Reads the depth at the specified position in NDC. x and y are clamped to [-1, 1].
	 * @param x x position in NDC
	 * @param y y position in NDC
	 * @return NDC depth [-1, 1] at the specified coordinates
	 */
	protected readDepthAtPosition(x: number, y: number): number {
		const width = this.depthBufferRenderTarget.width;
		const height = this.depthBufferRenderTarget.height;

		x = Math.max(Math.min(1, x), -1);
		y = Math.max(Math.min(1, y), -1);

		const xPixel = x * width / 2 + width / 2;
		const yPixel = y * height / 2 + height / 2;

		const depthPixel = new Float32Array(4);
		this.renderer.readRenderTargetPixels(this.depthBufferRenderTarget, xPixel, yPixel, 1, 1, depthPixel);

		let depth = depthPixel[0];
		depth = Math.min(1.0, depth);
		depth = Math.max(0.0, depth);
		depth = depth * 2 - 1;

		return depth;
	}

	/*
	Resilience helpers
	 */

	/**
	 * Sets up all resilience options according to the set flags.
	 */
	protected setupResilience(): void {
		this.setupMaxLowerRotationAngle();
		this.setupBoundingSphere();
		this.setupAngleToCameraUp();
	}

	protected setupBoundingSphereBound = this.setupBoundingSphere.bind(this);
	/**
	 * Calculates the bounding sphere of the scene and sets resilience variables accordingly.
	 * @protected
	 */
	protected setupBoundingSphere(): void {
		this.actualScene.traverse((object: Object3D) => {
			if (this.sceneHasMesh) return;
			else if (object instanceof Mesh) this.sceneHasMesh = true;
		});

		const box = new Box3().setFromObject(this.actualScene, true);
		box.getBoundingSphere(this.boundingSphere);

		if (this.boundingSphere.radius <= 0 && this.sceneHasMesh) console.warn('Could not calculate a valid bounding sphere for the given scene. This may break the navigation.');

		this.maxPanZoomDistance = this.boundingSphere.radius * 5;
		this.groundPlaneHeight = this._useBottomOfBoundingBoxAsGroundPlane ? box.min.y : 0;

		// Use negative offset to achieve positive y-height of plane
		this.groundPlane = new Plane(this.cameraUpVector, -this.groundPlaneHeight);

		this.updateFurthestSceneDepth();
		this._visualiser?.update({ boundingSphere: this.boundingSphere, groundPlaneHeight: this.groundPlaneHeight });
	}

	/**
	 * Sets maxLowerRotationAngle according to whether the navigation is allowed to rotate below the set ground plane.
	 * @protected
	 */
	protected setupMaxLowerRotationAngle(): void {
		this.maxLowerRotationAngle = this._allowRotationBelowGroundPlane ? Math.PI - 0.001 : Math.PI / 2;
		this._visualiser?.update({ rotationCenter: this.cameraLookAt });
	}

	/**
	 * Sets angleToYAxis as the current angle between the camera look-to vector (i.e., the vector between the camera and what it's looking at) and the cameraUp-vector (currently only the y-axis).
	 * @protected
	 */
	protected setupAngleToCameraUp(): void {
		if (this.camera.position.equals(new Vector3(0, 0, 0))) console.warn('Camera is at (0, 0, 0). This will break the navigation resilience!');

		this.angleToUpVector = this.camera.position.clone().sub(this.cameraLookAt.clone().setY(this.groundPlaneHeight)).angleTo(this.cameraUpVector);
		if (this.angleToUpVector === 0 || this.angleToUpVector === Math.PI) console.warn('Camera position is on y-axis. This will lead to navigation defects. Consider moving your camera.');
	}

	/**
	 * Calculates the furthest scene depth in camera coordinates.
	 * @protected
	 */
	protected updateFurthestSceneDepth(): void {
		this.sceneBackPoint.copy(this.boundingSphere.center.clone().addScaledVector(this.camera.getWorldDirection(new Vector3()), this.boundingSphere.radius));
		this.boundingDepthNDC = this.sceneBackPoint.clone().project(this.camera).z;
		this._visualiser?.update({ backPlaneAnchor: this.sceneBackPoint });
	}

	protected warnAboutEmptyScene(): void {
		if (this.hasWarnedAboutEmptyScene) return;

		this.hasWarnedAboutEmptyScene = true;
		console.warn('The given scene is empty, or was empty at WorldInHandControls creation. This breaks the navigation. If you have added things to the scene since then, dispatch a "change" event on the given scene.');
	}

	/*
	Pointer helpers
	 */

	/**
	 * Tracks up to two pointers. Expressly ignores any additional pointers.
	 * @param event The event to possibly track.
	 * @protected
	 */
	protected trackPointer(event: PointerEvent): void {
		if (this.pointers.length === 0 || (this.pointers.length === 1 && this.pointers[0].pointerId !== event.pointerId)) {
			this.pointers.push(event);
			this.previousPointers.push(event);
			return;
		}

		let index = -1;
		if (this.pointers[0].pointerId === event.pointerId) index = 0;
		else if (this.pointers[1].pointerId === event.pointerId) index = 1;
		else return;

		this.previousPointers[index] = this.pointers[index];
		this.pointers[index] = event;
	}

	/**
	 * Removes the specified pointer from tracking.
	 * @param event The event to remove from tracking.
	 * @protected
	 */
	protected removePointer(event: PointerEvent): void {
		let index = -1;

		if (this.pointers.length === 0) {
			return;
		} else if (this.pointers.length > 0 && this.pointers[0].pointerId === event.pointerId) {
			index = 0;
		} else if (this.pointers.length > 1 && this.pointers[1].pointerId === event.pointerId) {
			index = 1;
		} else {
			return;
		}

		this.pointers.splice(index, 1);
		this.previousPointers.splice(index, 1);
	}

	/**
	 * Gets the other tracked pointer from pointers.
	 * @param event The pointer NOT to return.
	 * @protected
	 */
	protected getOtherPointer(event: PointerEvent): PointerEvent | null {
		if (this.pointers.length < 2) {
			return null;
		} else if (this.pointers[0].pointerId === event.pointerId && this.pointers[1].pointerId !== event.pointerId) {
			return this.pointers[1];
		} else if (this.pointers[1].pointerId === event.pointerId && this.pointers[0].pointerId !== event.pointerId) {
			return this.pointers[0];
		} else {
			return null;
		}
	}

	protected getAveragePointerPosition(event: PointerEvent): Vector2 | null {
		const position = new Vector2();

		if (event.pointerType === 'mouse') {
			position.x = event.clientX;
			position.y = event.clientY;
		} else {
			const otherPointer = this.getOtherPointer(event);
			if (otherPointer === null) return null;

			position.x = (event.clientX + otherPointer.clientX) / 2;
			position.y = (event.clientY + otherPointer.clientY) / 2;
		}

		return position;
	}

	/*
	Setters
	 */

	/**
	 * Whether to allow rotation of the camera below the set ground plane.
	 */
	public set allowRotationBelowGroundPlane(value: boolean) {
		this._allowRotationBelowGroundPlane = value;
		this.setupMaxLowerRotationAngle();
	}

	/**
	 * Whether to use the bottom of the scene's bounding box as the ground plane. Uses y = 0 otherwise.
	 */
	public set useBottomOfBoundingBoxAsGroundPlane(value: boolean) {
		this._useBottomOfBoundingBoxAsGroundPlane = value;
		this.setupBoundingSphere();
		this.setupAngleToCameraUp();
	}

	/**
	 * Whether to rotate around the mouse position. Rotates around the screen's center otherwise.
	 */
	public set rotateAroundMousePosition(value: boolean) {
		this._rotateAroundMousePosition = value;
	}

	/**
	 * Whether to switch the function of the mouse buttons.
	 * If true, using the left mouse button will pan the scene, the right mouse button will rotate it.
	 * If false, using the right mouse button will pan the scene, the left mouse button will rotate it (this is the default).
	 */
	public set panWithLeftMouseButton(value: boolean) {
		if (value)
			this.mouseButtonConfiguration = { pan: 0, rotate: 2 };
		else
			this.mouseButtonConfiguration = { pan: 2, rotate: 0 };
	}

	/**
	 * The visualiser to use for debugging.
	 */
	public set worldInHandControlsVisualiser(visualiser: WorldInHandControlsVisualiser) {
		this._visualiser = visualiser;
	}
}