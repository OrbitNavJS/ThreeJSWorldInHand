import { 
	PerspectiveCamera,
	Mesh,
	Scene,
	SphereGeometry,
	MeshBasicMaterial,
	PlaneGeometry,
	PlaneHelper
} from 'three';

export class WorldInHandControlsVisualiser {
	protected camera: PerspectiveCamera;

	/**
	 * Toggle visibility of debug visualisers
	 */
	protected showMouseWorldPosition: boolean;
	protected showGroundPlane: boolean;
	protected showBackPlane: boolean;
	protected showBoundingSphere: boolean;

	/**
	 * Scene objects
	 */
	protected mouseWorldPosition: Mesh;
	protected groundPlane: Mesh;
	protected backPlane: PlaneHelper;
	protected boundingSphere: Mesh;

	protected scene: Scene;

	constructor(camera: PerspectiveCamera, showMouseWorldPosition?: boolean, showGroundPlane?: boolean, showBackPlane?: boolean, showBoundingSphere?: boolean) {
		this.camera = camera;

		this.showMouseWorldPosition = (showMouseWorldPosition !== undefined) ? showMouseWorldPosition : false;
		this.showGroundPlane = (showGroundPlane !== undefined) ? showGroundPlane : false;
		this.showBackPlane = (showBackPlane !== undefined) ? showBackPlane : false;
		this.showBoundingSphere = (showBoundingSphere !== undefined) ? showBoundingSphere : false;

		this.scene = new Scene();

		{
			const mouseWorldGeometry = new SphereGeometry(0.1);
			const mouseWorldMaterial = new MeshBasicMaterial({ color: 0xffffff });
			mouseWorldMaterial.depthWrite = false;
			mouseWorldMaterial.stencilWrite = false;
			this.mouseWorldPosition = new Mesh(mouseWorldGeometry, mouseWorldMaterial);
		}

		{
			const groundPlaneGeometry = new PlaneGeometry();
			const groundPlaneMaterial = new MeshBasicMaterial({ color: 0xffffff });
			groundPlaneMaterial.depthWrite = false;
			groundPlaneMaterial.stencilWrite = false;
			this.groundPlane = new Mesh(groundPlaneGeometry, groundPlaneMaterial);
		}

		{
			const backPlaneGeometry = new PlaneGeometry();
			const backPlaneMaterial = new MeshBasicMaterial({ color: 0xffffff });
			backPlaneMaterial.depthWrite = false;
			backPlaneMaterial.stencilWrite = false;
			this.backPlane = new Mesh(backPlaneGeometry, backPlaneMaterial);
		}

		{
			const boundingSphereGeometry = new SphereGeometry(0.1);
			const boundingSphereMaterial = new MeshBasicMaterial({ color: 0xffffff });
			boundingSphereMaterial.depthWrite = false;
			boundingSphereMaterial.stencilWrite = false;
			boundingSphereMaterial.wireframe = true;
			this.boundingSphere = new Mesh(boundingSphereGeometry, boundingSphereMaterial);
		}
	}
}