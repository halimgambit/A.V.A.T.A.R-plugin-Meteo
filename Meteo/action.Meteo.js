import {default as _helpers} from '../../ia/node_modules/ava-ia/helpers/index.js'

export default function (state) {
	return new Promise((resolve) => {
		setTimeout(() => { 
			state.action = {
				module: 'Meteo',
				command: state.rule,
				sentence: state.sentence,
				rawSentence: state.rawSentence
			};
			resolve(state);
		}, Config.waitAction.time);
	});
}
