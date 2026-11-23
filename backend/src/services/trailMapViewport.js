// Shared camera for the street raster and full-resolution PDF vectors.
const validCoordinate = c => Array.isArray(c) && typeof c[0] === 'number' && typeof c[1] === 'number' && Number.isFinite(c[0]) && Number.isFinite(c[1]) && Math.abs(c[0]) <= 180 && Math.abs(c[1]) <= 90;
function mercator(c) {
  const lat = Math.max(-85.05112878, Math.min(85.05112878, c[1])) * Math.PI / 180;
  return [(c[0] + 180) / 360, (1 - Math.log(Math.tan(Math.PI / 4 + lat / 2)) / Math.PI) / 2];
}
function trailMapViewport(input = {}) {
  const width = Math.min(1280, Math.max(200, Math.round(input.width || 780)));
  const height = Math.min(1280, Math.max(160, Math.round(input.height || 450)));
  const coordinates = [
    ...(input.coveredSegments?.flat() || input.coveredCoordinates || []),
    ...(input.expectedSegments?.flat() || input.expectedCoordinates || []),
    ...(input.stopCoordinates || []), input.entryCoord, input.exitCoord,
  ].filter(validCoordinate);
  if (!coordinates.length) return null;
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  coordinates.forEach(c => { const [x,y]=mercator(c); minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y); });
  const cx=(minX+maxX)/2, cy=(minY+maxY)/2;
  const longitude=Number((cx*360-180).toFixed(9));
  const latitude=Number((Math.atan(Math.sinh(Math.PI*(1-2*cy)))*180/Math.PI).toFixed(9));
  const padding=Math.max(38,Math.min(width,height)*0.10);
  // Static Images rounds zoom to two decimals; rounding down preserves the bounds.
  const zoom=Math.max(0,Math.min(16,Math.floor(Math.log2(Math.min((width-padding*2)/(512*Math.max(maxX-minX,1e-9)),(height-padding*2)/(512*Math.max(maxY-minY,1e-9))))*100)/100));
  const center=mercator([longitude,latitude]),world=512*2**zoom;
  return {width,height,longitude,latitude,zoom,project:coordinate=>{
    const [x,y]=mercator(coordinate);
    return [width/2+(x-center[0])*world,height/2+(y-center[1])*world];
  }};
}
module.exports={trailMapViewport,validCoordinate};
