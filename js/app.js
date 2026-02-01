import Library from './classes/Library.js';
import { MessageBox } from './classes/MessageBox.js';
import { ColorHandler } from './classes/ColorHandler.js';
import { Calendar } from './classes/Calendar.js';
import { Calculator } from './classes/Calculator.js';
import { WheelPicker } from './classes/WheelPicker30.js';
import { Haptic } from './classes/Haptic.js';
import { LoadManager } from './classes/LoadManager.js';
// import { AssetScanner } from './classes/AssetScanner.js';

import $, {format$} from './utils.js';

document.addEventListener('beforeShow', globalEventHandler);
document.addEventListener('close', globalEventHandler);
document.addEventListener('cancel', globalEventHandler);
document.addEventListener('buttonClick', globalEventHandler);
document.addEventListener('onweekclick', globalEventHandler);
document.addEventListener('ondateclick', globalEventHandler);
document.addEventListener('expand', globalEventHandler);
document.addEventListener('input', globalEventHandler);
document.addEventListener('overflow', globalEventHandler);


// const msgbox = new MessageBox("Mal sehen, ob's läuft...", null, 'OK, Close, Load', true, true);
const msgbox = new MessageBox({prompt: "Mal sehen, ob's läuft...", buttons: 'OK, Close, Load', closeButton: true});
// msgbox.debugMode = false;
// const msgbox = new MessageBox();
// msgbox.closeButton = false;

const result = await msgbox.show({
    prompt: `Das ist noch die alte MessageBox!\n\nDie läuft auch noch?`,
    title: 'Neue MessageBox!',
    buttons: [
        {caption: 'Ja', value: true, default: true},
        {caption: 'Nein', value: false, default: false},
        {caption: 'Abbrechen', value: null, default: false, cancel: true},
        'Hallo, das ist ein langer Button...'
    ],
    modal: true,
    closeButton: true}
);

// const result = await msgbox.show("Mal sehen, ob's läuft...",'Boxx','OK, Close, Load',true, true);



console.log('Antwort: ' + msgbox.value)

console.log('Postleitzahl von Zug ist: ' + format$(6300,'CH-####')); // → OK
console.log('Tel. Nr: ' + format$(799294262,'+41 (#)## ### ####')); //  → OK
console.log('BV-Nr: ' + format$(42026,'###-####')); //                  → OK
console.log('Zeit: ' + format$(730,'##:##')); //                        → OK
console.log('Zahl: ' + format$(485105,'#.##','en-US')); //                       → FALSCH! Richtig ==> 481,05 !!!
console.log('Zahl: ' + format$('003','#,##')); //                           → FALSCH! Richtig ==>   3,00 !!!
console.log('Zahl: ' + format$(7600000.025,'#,#')); //                           → FALSCH! Richtig ==>   3,00 !!!
console.log('Zahl: ' + format$(888.025,'#')); //                           → FALSCH! Richtig ==>   3,00 !!!

// msgbox.gradientFrom = 'white';
// msgbox.fade = true;
// msgbox.autoClose= 5;
// msgbox.includeReadOnlyProperties = true;

// $('btnMessageBox').addEventListener('click', run);


const colors = new ColorHandler(document.body);
const lib = new Library();

console.log(lib)

// document.addEventListener('DOMContentLoaded', run);

// const pbar = $('prgBar');
// const spnPercent = $('spnPercent');
// const loader = new LoadManager({scripts: true, styles: true, markup: true},'lblProgressBar')



async function run() {
    // await loader.loadAll('assets.json');
    // const result = await msgbox.show();
}

// const scanner = new AssetScanner();


// const combo = document.getElementById('cboLibraryDemo');
// console.log('=================================================================')
// console.dir(combo)

// const calendar = new Calendar();
// calendar.showSettings = true;

// const calculator = new Calculator(true, 'inpBuddy');
const calculator = new Calculator();
calculator.debugMode = false;
// calculator.visible = true;
// calculator.show();



$('input[type="text"][role="wheel"]', true).forEach(inp =>
    inp.addEventListener('pointerdown', showPicker)
);

function showPicker() {
    if ($('divWheelOverlay')) return;
    const picker = new WheelPicker(this, {onCustomModeReturn: 'text'});
    picker.debugMode = $('chkDebugMode').checked;
    picker.haptic.debugMode = $('chkDebugMode').checked;

    // 1. Array:
    // picker.dataSource = ['Norway','Sweden','Germany','Switzerland','United Kingdom','Spain'];

    // 2. String
    // picker.dataSource = "Montag, Dienstag, Mittwoch, Donnerstag, Freitag, Samstag, Sonntag";

    // 3. Object
    // picker.dataSource = {"10 x 10": 2.75, "12 x 12": 3.25, "15 x 15": 4.75};

    // 4. Object-Array
    // picker.onCustomModeReturn = 'object';
    picker.dataSource = [
        {januar: 1, februar: 2, märz: 3, april: 4, mai: 5, juni: 6},
        {montag: 1, dienstag: 2, mittwoch: 3, donnerstag: 4, freitag: 5, samstag: 6, sonntag: 7},
        {Anna: 0, alexandra: 1, lydia: 2, tucker: 6, hans: 12, john: 37, peter: 41},
        // {Olga: 31, mia: 38, kim: 54}
    ];

    picker.show();
}


function globalEventHandler(e) {
    console.log(e)
}