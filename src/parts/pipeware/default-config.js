import { createDefaultTileDimensions } from "../shared/tile-dimensions.js";
import {
	PIPEWARE_DEFAULT_BOARD_THICKNESS,
	PIPEWARE_DEFAULT_EDITOR_STATE,
} from "./constants.js";

export function createPipewareDefaultConfig() {
	return {
		width: 4,
		height: 4,
		...createDefaultTileDimensions(),
		pipewareBoardThicknessValue: PIPEWARE_DEFAULT_BOARD_THICKNESS,
		pipewarePlacements: [],
		pipewareSelectedPlacementId:
			PIPEWARE_DEFAULT_EDITOR_STATE.pipewareSelectedPlacementId,
		pipewareActiveFeatureConfig: {
			type: PIPEWARE_DEFAULT_EDITOR_STATE.pipewareActiveFeatureConfig.type,
			rotation:
				PIPEWARE_DEFAULT_EDITOR_STATE.pipewareActiveFeatureConfig.rotation,
			params: {
				...PIPEWARE_DEFAULT_EDITOR_STATE.pipewareActiveFeatureConfig.params,
			},
		},
	};
}
