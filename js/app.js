import Library from './classes/Library.js';
import { MessageBox } from './classes/MessageBox.js';
import { ColorHandler } from './classes/ColorHandler.js';
import { Calendar } from './classes/Calendar.js';
import { Calculator } from './classes/Calculator.js';
import { WheelPicker } from './classes/WheelPicker30.js';

import $, {format$} from './utils.js';

document.addEventListener('beforeShow', globalEventHandler);
document.addEventListener('beforeClose', globalEventHandler);
document.addEventListener('onweekclick', globalEventHandler);
document.addEventListener('ondateclick', globalEventHandler);
document.addEventListener('expand', globalEventHandler);
document.addEventListener('input', globalEventHandler);
document.addEventListener('overflow', globalEventHandler);

const msgbox = new MessageBox("Mal sehen, ob's läuft...", null, 'OK, Close, Load', true, true);

// msgbox.gradientFrom = 'white';
// msgbox.fade = true;
// msgbox.autoClose= 5;
msgbox.includeReadOnlyProperties = true;
// const result = await msgbox.show();
const body = document.getElementById('demoBody');
const colors = new ColorHandler(body);
const lib = new Library();

// const combo = document.getElementById('cboLibraryDemo');
// console.log('=================================================================')
// console.dir(combo)

// const calendar = new Calendar();
// calendar.showSettings = true;

// const calculator = new Calculator(true, 'inpBuddy');
// const calculator = new Calculator(true);

// const picker = new WheelPicker($('inpArrival'));



$('input[type="text"][role="wheel"]', true).forEach(inp =>
    inp.addEventListener('pointerdown', showPicker)
);

function showPicker() {
    if ($('divWheelOverlay')) return;
    const picker = new WheelPicker(this, {onCustomModeReturn: 'text'});
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