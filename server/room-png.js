import { inflateSync, crc32 } from 'node:zlib';

// Workshop output contract: non-interlaced 8-bit RGB/RGBA PNG, 1920Ã—1080.
// Validate chunks, checksums and scanline data before publishing static assets.
export function validateRoomPng(bytes) {
  const fail = () => { throw new Error('Room image must be a complete 1920Ã—1080, 8-bit RGB/RGBA PNG.'); };
  if (!bytes || bytes.length < 57 || bytes.length > 24*1024*1024 || bytes.subarray(0,8).toString('hex') !== '89504e470d0a1a0a') fail();
  let width=0, height=0, offset=8, channels=0, ended=false, dataEnded=false; const compressed=[];
  while(offset<bytes.length) {
    if(offset+12>bytes.length)fail();
    const length=bytes.readUInt32BE(offset), end=offset+12+length;
    if(end>bytes.length)fail();
    const type=bytes.toString('ascii',offset+4,offset+8), data=bytes.subarray(offset+8,end-4);
    if(crc32(bytes.subarray(offset+4,end-4))!==bytes.readUInt32BE(end-4))fail();
    if(offset===8 && type!=='IHDR')fail();
    if(type==='IHDR') {
      if(offset!==8 || length!==13 || data[8]!==8 || ![2,6].includes(data[9]) || data[10]!==0 || data[11]!==0 || data[12]!==0)fail();
      width=data.readUInt32BE(0); height=data.readUInt32BE(4);
      if(width<1024 || width>4096 || height<576 || height>2304 || Math.abs(width/height-16/9)>.01)fail();
      channels=data[9]===6?4:3;
    } else if(type==='IDAT') { if(dataEnded)fail();compressed.push(data); }
    else if(type==='IEND') { if(length || !compressed.length || end!==bytes.length)fail();ended=true; }
    else { if(compressed.length)dataEnded=true; if(type[0]===type[0].toUpperCase() && type!=='PLTE')fail(); }
    offset=end;
  }
  if(!ended || !channels)fail();
  const stride=width*channels+1, expected=stride*height;
  const decoded=inflateSync(Buffer.concat(compressed),{maxOutputLength:expected});
  if(decoded.length!==expected)fail();
  for(let i=0;i<decoded.length;i+=stride)if(decoded[i]>4)fail();
}
