import { 
	PerspectiveCamera,
	Mesh,
	Group,
	SphereGeometry,
	Sphere,
	MeshBasicMaterial,
	PlaneGeometry,
	PlaneHelper,
	Plane,
	Vector3,
	DoubleSide
} from 'three';

export type UpdateData = {
	mouseWorldPosition?: Vector3,
	groundPlaneHeight?: number,
	backPlaneAnchor?: Vector3,
	boundingSphere?: Sphere,
	planeHeightGuideHeight?: number
}

export type VisibilitySetters = {
	showMouseWorldPosition?: boolean,
	showGroundPlane?: boolean,
	showBackPlane?: boolean,
	showBoundingSphere?: boolean,
	showPlaneHeightGuide?: boolean
}

export class WorldInHandControlsVisualiser {
	protected camera: PerspectiveCamera;

	/**
	 * Toggle visibility of debug visualisers
	 */
	protected _showMouseWorldPosition: boolean;
	protected _showGroundPlane: boolean;
	protected _showBackPlane: boolean;
	protected _showBoundingSphere: boolean;
	protected _showPlaneHeightGuide: boolean;

	/**
	 * Scene objects
	 */
	protected mouseWorldPosition: Mesh;
	protected groundPlane: Mesh;
	protected backPlane: PlaneHelper;
	protected boundingSphere: Mesh;
	protected planeHeightGuide: Mesh;

	readonly group: Group;

	constructor(camera: PerspectiveCamera, showMouseWorldPosition?: boolean, showGroundPlane?: boolean, showBackPlane?: boolean, showBoundingSphere?: boolean, showPlaneHeightGuide?: boolean) {
		this.camera = camera;

		/** Create basic scene objects */
		this.group = new Group();
		{
			const mouseWorldGeometry = new SphereGeometry(1);
			const mouseWorldMaterial = new MeshBasicMaterial({ color: 0xffffff, side: DoubleSide });
			mouseWorldMaterial.depthWrite = false;
			mouseWorldMaterial.stencilWrite = false;
			this.mouseWorldPosition = new Mesh(mouseWorldGeometry, mouseWorldMaterial);
		}

		{
			const groundPlaneGeometry = new PlaneGeometry();
			const groundPlaneMaterial = new MeshBasicMaterial({ color: 0xffffff, side: DoubleSide});
			groundPlaneMaterial.depthWrite = false;
			groundPlaneMaterial.stencilWrite = false;
			this.groundPlane = new Mesh(groundPlaneGeometry, groundPlaneMaterial);
		}

		{
			const heightGuideGeometry = new PlaneGeometry();
			const heightGuideMaterial = new MeshBasicMaterial({ color: 0xffffff, side: DoubleSide  });
			heightGuideMaterial.depthWrite = false;
			heightGuideMaterial.stencilWrite = false;
			this.planeHeightGuide = new Mesh(heightGuideGeometry, heightGuideMaterial);
		}

		{
			const actualBackPlane = new Plane(new Vector3(0, 0, 1).unproject(camera).normalize(), 0);
			const backPlaneMaterial = new MeshBasicMaterial({ color: 0xffffff, side: DoubleSide  });
			backPlaneMaterial.depthWrite = false;
			backPlaneMaterial.stencilWrite = false;
			this.backPlane = new PlaneHelper(actualBackPlane);
		}

		{
			const boundingSphereGeometry = new SphereGeometry();
			const boundingSphereMaterial = new MeshBasicMaterial({ color: 0xffffff, side: DoubleSide  });
			boundingSphereMaterial.depthWrite = false;
			boundingSphereMaterial.stencilWrite = false;
			boundingSphereMaterial.wireframe = true;
			this.boundingSphere = new Mesh(boundingSphereGeometry, boundingSphereMaterial);
		}

		/** Toggle visibilty */ 
		this.showMouseWorldPosition = (showMouseWorldPosition !== undefined) ? showMouseWorldPosition : false;
		this.showGroundPlane = (showGroundPlane !== undefined) ? showGroundPlane : false;
		this.showBackPlane = (showBackPlane !== undefined) ? showBackPlane : false;
		this.showBoundingSphere = (showBoundingSphere !== undefined) ? showBoundingSphere : false;
		this.showPlaneHeightGuide = (showPlaneHeightGuide !== undefined) ? showPlaneHeightGuide : false;
	}

	public update(data: UpdateData) {
		if (data.mouseWorldPosition) {
			this.mouseWorldPosition.position.copy(data.mouseWorldPosition);
		}

		if (data.groundPlaneHeight) {
			this.groundPlane.position.set(0, data.groundPlaneHeight, 0);
		}

		if (data.backPlaneAnchor) {
			const normal = new Vector3(0, 0, 1).unproject(this.camera).normalize();
			const actualBackPlane = new Plane().setFromNormalAndCoplanarPoint(normal, data.backPlaneAnchor);
			this.backPlane = new PlaneHelper(actualBackPlane);
		}

		if (data.boundingSphere) {
			this.boundingSphere.position.copy(data.boundingSphere.center);
			this.boundingSphere.scale.set(data.boundingSphere.radius, data.boundingSphere.radius, data.boundingSphere.radius);
		}

		if (data.planeHeightGuideHeight) {
			this.planeHeightGuide.position.set(0, data.planeHeightGuideHeight, 0);
		}
	}

	public setVisibility(visibilities: VisibilitySetters) {
		if (visibilities.showMouseWorldPosition) this.showMouseWorldPosition = visibilities.showMouseWorldPosition;
		if (visibilities.showBackPlane) this.showBackPlane = visibilities.showBackPlane;
		if (visibilities.showBoundingSphere) this.showBoundingSphere = visibilities.showBoundingSphere;
		if (visibilities.showGroundPlane) this.showGroundPlane = visibilities.showGroundPlane;
		if (visibilities.showPlaneHeightGuide) this.showPlaneHeightGuide = visibilities.showPlaneHeightGuide;
	}
		
	/**
	 * Setters
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

	public set showPlaneHeightGuide(value: boolean) {
		if (this.showPlaneHeightGuide === value) return;

		this._showPlaneHeightGuide = value;

		if (value) this.group.add(this.planeHeightGuide);
		else this.group.remove(this.planeHeightGuide);
	}
}