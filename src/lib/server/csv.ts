export function csvCell(input:unknown):string{
  let value=String(input??'');
  if(/^[=+\-@\t\r]/.test(value)) value=`'${value}`;
  return `"${value.replace(/"/g,'""')}"`;
}
