// Resolve exactly one deliberate review action. A held key never rates a card.
export function reviewKeyAction(event, keys, submitted=false) {
 if(submitted || event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.target?.matches?.('input,textarea,select'))return null;
 if(event.code===keys.confirm)return 'confirm';
 if(event.code===keys.cancel)return 'cancel';
 if(['ArrowLeft','ArrowUp'].includes(event.key))return 'previous';
 if(['ArrowRight','ArrowDown'].includes(event.key))return 'next';
 if(event.key.toLowerCase()==='a')return 'confirm';
 if(event.key.toLowerCase()==='b')return 'cancel';
 return null;
}
