import {
	PerspectiveCamera,
	Mesh,
	Group,
	SphereGeometry,
	Sphere,
	MeshBasicMaterial,
	PlaneGeometry,
	Plane,
	Vector3,
	DoubleSide,
	CylinderGeometry, Material, Object3D
} from 'three';

export type UpdateData = {
	mouseWorldPosition?: Vector3,
	groundPlaneHeight?: number,
	backPlaneAnchor?: Vector3,
	boundingSphere?: Sphere,
	panHeightGuideHeight?: number,
	maxNavigationSphereCenter?: Vector3,
	rotationCenter?: Vector3,
};

export type VisibilitySetters = {
	showMouseWorldPosition?: boolean,
	showGroundPlane?: boolean,
	showBackPlane?: boolean,
	showBoundingSphere?: boolean,
	showMaxNavigationSphere?: boolean,
	showPanHeightGuide?: boolean,
	showRotationCenter?: boolean
};

export class WorldInHandControlsVisualiser {
	protected camera: PerspectiveCamera;

	/*
	 * Toggle visibility of debug visualisers
	 */

	protected _showMouseWorldPosition: boolean = false;
	protected _showGroundPlane: boolean = false;
	protected _showBackPlane: boolean = false;
	protected _showBoundingSphere: boolean = false;
	protected _showMaxNavigationSphere: boolean = false;
	protected _showPanHeightGuide: boolean = false;
	protected _showRotationCenter: boolean = false;

	/*
	 * Scene objects
	 */

	protected mouseWorldPosition: Mesh;
	protected groundPlane: Mesh;
	protected backPlane: Mesh;
	protected boundingSphere: Mesh;
	protected maxNavigationSphere: Mesh;
	protected panHeightGuide: Mesh;
	protected rotationCenter: Group;

	readonly group: Group;

	constructor(camera: PerspectiveCamera, showMouseWorldPosition?: boolean, showGroundPlane?: boolean, showBackPlane?: boolean, showBoundingSphere?: boolean, showMaxNavigationSphere?: boolean, showPanHeightGuide?: boolean, showRotationCenter?: boolean) {
		this.camera = camera;

		/*
		Create basic scene objects
		*/

		this.group = new Group();
		// ensure correct render order
		this.group.renderOrder = Number.MAX_SAFE_INTEGER;
		{
			const mouseWorldGeometry = new SphereGeometry(1);
			const mouseWorldMaterial = new MeshBasicMaterial({ color: 0x0000ff, side: DoubleSide, transparent: true });
			mouseWorldMaterial.depthWrite = false;
			mouseWorldMaterial.stencilWrite = false;
			this.mouseWorldPosition = new Mesh(mouseWorldGeometry, mouseWorldMaterial);
		}

		{
			const groundPlaneGeometry = new PlaneGeometry();
			groundPlaneGeometry.rotateX(Math.PI / 2);
			const groundPlaneMaterial = new MeshBasicMaterial({ color: 0xff0000, side: DoubleSide, transparent: true});
			groundPlaneMaterial.depthWrite = false;
			groundPlaneMaterial.stencilWrite = false;
			this.groundPlane = new Mesh(groundPlaneGeometry, groundPlaneMaterial);
		}

		{
			const heightGuideGeometry = new PlaneGeometry();
			heightGuideGeometry.rotateX(Math.PI / 2);
			const heightGuideMaterial = new MeshBasicMaterial({ color: 0x00ff00, side: DoubleSide, transparent: true });
			heightGuideMaterial.depthWrite = false;
			heightGuideMaterial.stencilWrite = false;
			this.panHeightGuide = new Mesh(heightGuideGeometry, heightGuideMaterial);
		}

		{
			const backPlaneMaterial = new MeshBasicMaterial({ color: 0xffffff, side: DoubleSide, transparent: true });
			const backPlaneGeometry = new PlaneGeometry();
			backPlaneMaterial.depthWrite = false;
			backPlaneMaterial.stencilWrite = false;
			this.backPlane = new Mesh(backPlaneGeometry, backPlaneMaterial);
		}

		{
			const boundingSphereGeometry = new SphereGeometry();
			const boundingSphereMaterial = new MeshBasicMaterial({ color: 0xffffff, side: DoubleSide});
			boundingSphereMaterial.depthWrite = false;
			boundingSphereMaterial.stencilWrite = false;
			boundingSphereMaterial.wireframe = true;
			this.boundingSphere = new Mesh(boundingSphereGeometry, boundingSphereMaterial);
		}

		{	
			const maxNavigationSphereGeometry = new SphereGeometry();
			const maxNavigationSphereMaterial = new MeshBasicMaterial({ color: 0xffff00, side: DoubleSide });
			maxNavigationSphereMaterial.depthWrite = false;
			maxNavigationSphereMaterial.stencilWrite = false;
			maxNavigationSphereMaterial.wireframe = true;
			this.maxNavigationSphere = new Mesh(maxNavigationSphereGeometry, maxNavigationSphereMaterial);
		}

		{
			const rotationCenterGeometry = new CylinderGeometry(0.05, 0.05, 1);
			const rotationCenterMaterial = new MeshBasicMaterial({ color: 0xff0000, side: DoubleSide });
			rotationCenterMaterial.depthWrite = false;
			rotationCenterMaterial.stencilWrite = false;

			this.rotationCenter = new Group();
			this.rotationCenter.renderOrder = Number.MAX_SAFE_INTEGER;
			const cylinderHorizontal = new Mesh(rotationCenterGeometry, rotationCenterMaterial);
			const cylinderVertical = new Mesh(rotationCenterGeometry, rotationCenterMaterial);
			cylinderHorizontal.rotateX(Math.PI / 2);

			this.rotationCenter.add(cylinderHorizontal);
			this.rotationCenter.add(cylinderVertical);
		}

		/*
		Toggle visibilty
		*/

		this.showMouseWorldPosition = (showMouseWorldPosition !== undefined) ? showMouseWorldPosition : false;
		this.showGroundPlane = (showGroundPlane !== undefined) ? showGroundPlane : false;
		this.showBackPlane = (showBackPlane !== undefined) ? showBackPlane : false;
		this.showBoundingSphere = (showBoundingSphere !== undefined) ? showBoundingSphere : false;
		this.showMaxNavigationSphere = (showMaxNavigationSphere !== undefined) ? showMaxNavigationSphere : false;
		this.showPanHeightGuide = (showPanHeightGuide !== undefined) ? showPanHeightGuide : false;
		this.showRotationCenter = (showRotationCenter !== undefined) ? showRotationCenter : false;
	}

	public update(data: UpdateData) {
		if (data.mouseWorldPosition) {
			this.mouseWorldPosition.position.copy(data.mouseWorldPosition);
			this.panHeightGuide.position.setX(data.mouseWorldPosition.x);
			this.panHeightGuide.position.setZ(data.mouseWorldPosition.z);
		}

		if (data.groundPlaneHeight) {
			this.groundPlane.position.set(0, data.groundPlaneHeight, 0);
		}

		if (data.backPlaneAnchor) {
			const normal = new Vector3(0, 0, 1).unproject(this.camera).normalize();
			const actualBackPlane = new Plane().setFromNormalAndCoplanarPoint(normal, data.backPlaneAnchor);
			this.backPlane.position.set(0, 0, 0);
			this.backPlane.lookAt(actualBackPlane.normal);
			this.backPlane.translateZ(-actualBackPlane.constant);
		}

		if (data.boundingSphere) {
			this.boundingSphere.position.copy(data.boundingSphere.center);
			this.boundingSphere.scale.set(data.boundingSphere.radius, data.boundingSphere.radius, data.boundingSphere.radius);

			const maxSphereRadius = data.boundingSphere.radius * 5;
			this.maxNavigationSphere.scale.set(maxSphereRadius, maxSphereRadius, maxSphereRadius);
		}

		if (data.panHeightGuideHeight) {
			this.panHeightGuide.position.set(0, data.panHeightGuideHeight, 0);
		}

		if (data.maxNavigationSphereCenter) {
			this.maxNavigationSphere.position.copy(data.maxNavigationSphereCenter);
		}

		if(data.rotationCenter) {
			const cylinderHorizontal = this.rotationCenter.children[0] as Mesh;
			const cylinderVertical = this.rotationCenter.children[1] as Mesh;

			const cameraRight = new Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
			const cameraRightXZ = new Vector3(cameraRight.x, 0, cameraRight.z).normalize();

			cylinderHorizontal.lookAt(cylinderHorizontal.position.clone().add(cameraRightXZ));
			cylinderHorizontal.rotateY(Math.PI / 2);
			cylinderHorizontal.rotateZ(Math.PI / 2);

			cylinderHorizontal.position.copy(data.rotationCenter);
			cylinderVertical.position.copy(data.rotationCenter);
		}}
	
	public dispose(){
		this.setVisibility({
			showMouseWorldPosition: false,
			showGroundPlane: false,
			showBackPlane: false,
			showBoundingSphere: false,
			showMaxNavigationSphere: false,
			showPanHeightGuide: false,
			showRotationCenter: false
		});

		this.mouseWorldPosition.geometry.dispose();
		(this.mouseWorldPosition.material as Material).dispose();
		this.groundPlane.geometry.dispose();
		(this.groundPlane.material as Material).dispose();
		this.backPlane.geometry.dispose();
		(this.backPlane.material as Material).dispose();
		this.boundingSphere.geometry.dispose();
		(this.boundingSphere.material as Material).dispose();
		this.maxNavigationSphere.geometry.dispose();
		(this.maxNavigationSphere.material as Material).dispose();
		this.panHeightGuide.geometry.dispose();
		(this.panHeightGuide.material as Material).dispose();

		this.rotationCenter.traverse((object: Object3D) => {
			(object as Mesh).geometry.dispose();
			((object as Mesh).material as Material).dispose();
		});
		this.rotationCenter.clear();
		this.group.clear();
	}

	public setVisibility(visibilities: VisibilitySetters) {
		if (visibilities.showMouseWorldPosition) this.showMouseWorldPosition = visibilities.showMouseWorldPosition;
		if (visibilities.showBackPlane) this.showBackPlane = visibilities.showBackPlane;
		if (visibilities.showBoundingSphere) this.showBoundingSphere = visibilities.showBoundingSphere;
		if (visibilities.showMaxNavigationSphere) this.showMaxNavigationSphere = visibilities.showMaxNavigationSphere;
		if (visibilities.showGroundPlane) this.showGroundPlane = visibilities.showGroundPlane;
		if (visibilities.showPanHeightGuide) this.showPanHeightGuide = visibilities.showPanHeightGuide;
		if (visibilities.showRotationCenter) this.showRotationCenter = visibilities.showRotationCenter;
	}
		
	/*
	Setters
	*/

	public set showMouseWorldPosition(value: boolean) {
		if (this.showMouseWorldPosition === value) return;

		this._showMouseWorldPosition = value;

		if (value) this.group.add(this.mouseWorldPosition);
		else this.group.remove(this.mouseWorldPosition);
	}

	public set showGroundPlane(value: boolean) {
		if (this.showGroundPlane === value) return;

		this._showGroundPlane = value;

		if (value) this.group.add(this.groundPlane);
		else this.group.remove(this.groundPlane);
	}

	public set showBackPlane(value: boolean) {
		if (this.showBackPlane === value) return;

		this._showBackPlane = value;

		if (value) this.group.add(this.backPlane);
		else this.group.remove(this.backPlane);
	}

	public set showBoundingSphere(value: boolean) {
		if (this.showBoundingSphere === value) return;

		this._showBoundingSphere = value;

		if (value) this.group.add(this.boundingSphere);
		else this.group.remove(this.boundingSphere);
	}

	public set showMaxNavigationSphere(value: boolean) {
		if (this.showMaxNavigationSphere === value) return;

		this._showMaxNavigationSphere = value;

		if (value) this.group.add(this.maxNavigationSphere);
		else this.group.remove(this.maxNavigationSphere);
	}

	public set showPanHeightGuide(value: boolean) {
		if (this.showPanHeightGuide === value) return;

		this._showPanHeightGuide = value;

		if (value) this.group.add(this.panHeightGuide);
		else this.group.remove(this.panHeightGuide);
	}

	public set showRotationCenter(value: boolean) {
		if (this.showRotationCenter === value) return;

		this._showRotationCenter = value;

		if (value) this.group.add(this.rotationCenter);
		else this.group.remove(this.rotationCenter);
	}

	/*
	Scale setters
	*/

	public set mouseWorldPositionSize(value: number) {
		this.mouseWorldPosition.scale.set(value, value, value);
	}

	public set panHeightGuideSize(value: number) {
		this.panHeightGuide.scale.set(value, value, value);
	}

	public set groundPlaneSize(value: number) {
		this.groundPlane.scale.set(value, value, value);
	}
	
	public set backPlaneSize(value: number) {
		this.backPlane.scale.set(value, value, value);
	}

	public set rotationCenterSize(value: number) {
		(this.rotationCenter.children[0] as Mesh).scale.set(value, value, value);
		(this.rotationCenter.children[1] as Mesh).scale.set(value, value, value);
	}

	/*
	Color setters
	*/
	
	public set mouseWorldPositionColor(value: number){
		(this.mouseWorldPosition.material as MeshBasicMaterial).color.set(value);
	}

	public set groundPlaneColor(value: number){
		(this.groundPlane.material as MeshBasicMaterial).color.set(value);
	}

	public set backPlaneColor(value: number){
		(this.backPlane.material as MeshBasicMaterial).color.set(value);
	}

	public set panHeightGuideColor(value: number){
		(this.panHeightGuide.material as MeshBasicMaterial).color.set(value);
	}

	public set boundingSphereColor(value: number){
		(this.boundingSphere.material as MeshBasicMaterial).color.set(value);
	}

	public set maxNavigationSphereColor(value: number){
		(this.maxNavigationSphere.material as MeshBasicMaterial).color.set(value);
	}

	public set rotationCenterColor(value: number){
		((this.rotationCenter.children[0] as Mesh).material as MeshBasicMaterial).color.set(value);
		((this.rotationCenter.children[1] as Mesh).material as MeshBasicMaterial).color.set(value);
	}

	/*
	Opacity setters
	*/

	public set mouseWorldPositionOpacity(value: number){
		(this.mouseWorldPosition.material as MeshBasicMaterial).opacity = value;
	}

	public set groundPlaneOpacity(value: number){
		(this.groundPlane.material as MeshBasicMaterial).opacity = value;
	}

	public set backPlaneOpacity(value: number){
		(this.backPlane.material as MeshBasicMaterial).opacity = value;
	}

	public set panHeightGuideOpacity(value: number){
		(this.panHeightGuide.material as MeshBasicMaterial).opacity = value;
	}

	public set rotationCenterOpacity(value: number){
		((this.rotationCenter.children[0] as Mesh).material as MeshBasicMaterial).opacity = value;
		((this.rotationCenter.children[1] as Mesh).material as MeshBasicMaterial).opacity = value;
	}
}