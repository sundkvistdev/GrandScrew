import XmlParser from "./XmlParser.js";
import XmlVisualizer from "./XmlVisualizer.js";
import CanvMgr from "./CanvMgr.js";

const POLICE_FILE = "../POLICE.xml";

function insertDom(root, xmlNode) {

}

async function main() {
	const data = new XmlParser().parse(await (await fetch(POLICE_FILE)).text());
	const visEl = document.createElement("div");
	document.body.appendChild(visEl);
	const vis = new XmlVisualizer(visEl);
	vis.show(data);
	const canvas = document.getElementById("map");

	const mgr = new CanvMgr(canvas, {
		background: "#101010",

		zoom: 1,
		minZoom: 0.05,
		maxZoom: 15,

		enableGrid: true,
		gridSize: 100,

		/*
		* Right mouse = pan.
		* Middle mouse = pan.
		*/
		allowRightButtonPan: true,
		allowMiddleButtonPan: true,

		/*
		* Set to true if you want conventional left-click dragging.
		*/
		allowLeftButtonPan: false
	});


	/*
	* WORLD LAYER
	*/
	mgr.addWorldLayer(
		"map",
		(ctx, camera) => {
			void camera;

			/*
			* Example 3600 x 2600 m world.
			*/
			mgr.drawWorldRect(
				ctx,
				-1800,
				-1300,
				3600,
				2600,
				"#252525"
			);

			/*
			* Example city region.
			*/
			mgr.drawWorldRect(
				ctx,
				0,
				-1300,
				1800,
				1000,
				"#303846",
				"#536078",
				2
			);

			/*
			* Example county region.
			*/
			mgr.drawWorldRect(
				ctx,
				0,
				1300,
				1800,
				1000,
				"#39352e",
				"#746a54",
				2
			);

			/*
			* Example bay town.
			*/
			mgr.drawWorldRect(
				ctx,
				-1600,
				1200,
				320,
				200,
				"#403434",
				"#9b5e5e",
				2
			);

			/*
			* A world point.
			*/
			mgr.drawWorldCircle(
				ctx,
				250,
				450,
				15,
				"#ff4444"
			);

			/*
			* World-space label.
			*/
			mgr.drawWorldText(
				ctx,
				"Police unit",
				250,
				450,
				{
					font: "14px sans-serif",
					fillStyle: "#ffffff",
					offsetX: 20,
					offsetY: -6
				}
			);
		}
	);


	/*
	* HUD LAYER
	*/
	mgr.addHudLayer(
		"hud",
		(ctx) => {
			mgr.drawHudRect(
				ctx,
				10,
				10,
				220,
				84,
				"rgba(0,0,0,0.65)"
			);

			mgr.drawHudText(
				ctx,
				"Camera",
				20,
				20,
				{
					font: "bold 15px sans-serif"
				}
			);

			mgr.drawHudText(
				ctx,
				"X: " +
					mgr.camera.x.toFixed(1),
				20,
				42
			);

			mgr.drawHudText(
				ctx,
				"Y: " +
					mgr.camera.y.toFixed(1),
				20,
				60
			);

			mgr.drawHudText(
				ctx,
				"Zoom: " +
					mgr.zoom.toFixed(2) +
					"x",
				20,
				78
			);
		}
	);

	mgr.start();
}

main();