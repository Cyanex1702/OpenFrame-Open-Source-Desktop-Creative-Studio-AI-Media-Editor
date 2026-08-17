import type React from "react";
import { assetPreviewUrl } from "../lib/native";
import type { DesignObject } from "../types/design";
import type { MediaAsset } from "../types/project";

type Corner = "nw" | "ne" | "sw" | "se";
interface CanvasHandlers {
  down: React.PointerEventHandler<SVGGElement>;
  move: React.PointerEventHandler<SVGGElement>;
  up: React.PointerEventHandler<SVGGElement>;
  resizeDown: (event: React.PointerEvent<SVGCircleElement>, corner: Corner) => void;
  rotateDown: React.PointerEventHandler<SVGCircleElement>;
}

export function DesignCanvasObject({ object, asset, selected, handlers }: { object: DesignObject; asset?: MediaAsset; selected: boolean; handlers: CanvasHandlers }) {
  const transform = `rotate(${object.rotation} ${object.x + object.width / 2} ${object.y + object.height / 2})`;
  const style: React.CSSProperties = { opacity: object.opacity, mixBlendMode: object.blendMode === "normal" ? "normal" : object.blendMode, filter: objectFilter(object), cursor: object.locked ? "not-allowed" : "move" };
  const gradientId = "gradient_" + object.id, fill = object.fillSecondary ? `url(#${gradientId})` : object.fill, imageUrl = asset ? assetPreviewUrl(asset) : "";
  const handles: Array<[Corner, number, number]> = [["nw", object.x, object.y], ["ne", object.x + object.width, object.y], ["sw", object.x, object.y + object.height], ["se", object.x + object.width, object.y + object.height]];
  const text = applyTextTransform(object.text ?? "", object.textTransform);
  return <g transform={transform} style={style} onPointerDown={handlers.down} onPointerMove={handlers.move} onPointerUp={handlers.up} onPointerCancel={handlers.up}>
    {object.fillSecondary && <defs><linearGradient id={gradientId} gradientTransform={`rotate(${object.gradientAngle} .5 .5)`}><stop offset="0" stopColor={object.fill} /><stop offset="1" stopColor={object.fillSecondary} /></linearGradient></defs>}
    {object.type === "rectangle" && <rect x={object.x} y={object.y} width={object.width} height={object.height} rx={object.cornerRadius} fill={fill} stroke={object.stroke} strokeWidth={object.strokeWidth} />}
    {object.type === "ellipse" && <ellipse cx={object.x + object.width / 2} cy={object.y + object.height / 2} rx={object.width / 2} ry={object.height / 2} fill={fill} stroke={object.stroke} strokeWidth={object.strokeWidth} />}
    {object.type === "star" && <polygon points={starPoints(object)} fill={fill} stroke={object.stroke} strokeWidth={object.strokeWidth} />}
    {object.type === "arrow" && <path d={arrowPath(object)} fill={fill} stroke={object.stroke} strokeWidth={object.strokeWidth} />}
    {object.type === "path" && <path d={object.path} fill="none" stroke={object.pathColor} strokeWidth={object.pathWidth} strokeLinecap="round" strokeLinejoin="round" />}
    {object.type === "text" && <text x={textX(object)} y={object.y + (object.fontSize ?? 72)} fill={fill} stroke={object.strokeWidth ? object.stroke : "none"} strokeWidth={object.strokeWidth} paintOrder="stroke" fontFamily={object.fontFamily} fontSize={object.fontSize} fontWeight={object.fontWeight} fontStyle={object.fontStyle} letterSpacing={object.letterSpacing} textAnchor={object.textAlign === "center" ? "middle" : object.textAlign === "right" ? "end" : "start"}>{text.split("\n").map((line, index) => <tspan key={index} x={textX(object)} dy={index ? (object.fontSize ?? 72) * (object.lineHeight ?? 1.08) : 0}>{line}</tspan>)}</text>}
    {(object.type === "image" || object.type === "frame") && imageUrl && <image href={imageUrl} x={object.x - object.width * object.crop.x / object.crop.width} y={object.y - object.height * object.crop.y / object.crop.height} width={object.width / object.crop.width} height={object.height / object.crop.height} preserveAspectRatio="xMidYMid slice" clipPath={`url(#clip_${object.id})`} transform={`translate(${object.x + object.width / 2} ${object.y + object.height / 2}) scale(${object.flipHorizontal ? -1 : 1} ${object.flipVertical ? -1 : 1}) translate(${-object.x - object.width / 2} ${-object.y - object.height / 2})`} />}`n    {(object.type === "image" || object.type === "frame") && imageUrl && object.strokeWidth > 0 && <rect x={object.x} y={object.y} width={object.width} height={object.height} rx={object.frameShape === "circle" ? object.width / 2 : object.cornerRadius} fill="none" stroke={object.stroke} strokeWidth={object.strokeWidth} clipPath={`url(#clip_${object.id})`} />}
    {object.type === "frame" && !imageUrl && <rect x={object.x} y={object.y} width={object.width} height={object.height} rx={object.frameShape === "circle" ? object.width / 2 : object.cornerRadius} fill="#242c35" stroke="#627080" strokeDasharray="12 8" strokeWidth="4" />}
    {selected && <g className="design-transform-controls" style={{ opacity: 1, filter: "none" }}>
      <rect className="design-selection" x={object.x - 5} y={object.y - 5} width={object.width + 10} height={object.height + 10} fill="none" stroke="#b9f75a" strokeWidth="3" strokeDasharray="10 7" vectorEffect="non-scaling-stroke" />
      <line x1={object.x + object.width / 2} y1={object.y - 5} x2={object.x + object.width / 2} y2={object.y - 42} stroke="#b9f75a" strokeWidth="3" vectorEffect="non-scaling-stroke" />
      <circle className="design-rotate-handle" cx={object.x + object.width / 2} cy={object.y - 50} r="11" fill="#10151b" stroke="#b9f75a" strokeWidth="3" vectorEffect="non-scaling-stroke" onPointerDown={handlers.rotateDown} />
      {handles.map(([corner, cx, cy]) => <circle key={corner} className={`design-resize-handle ${corner}`} cx={cx} cy={cy} r="11" fill="#fff" stroke="#151a20" strokeWidth="3" vectorEffect="non-scaling-stroke" onPointerDown={(event) => handlers.resizeDown(event, corner)} />)}
    </g>}
  </g>;
}
export function DesignClip({ object }: { object: DesignObject }) {
  return <clipPath id={"clip_" + object.id}>{object.frameShape === "circle" ? <ellipse cx={object.x + object.width / 2} cy={object.y + object.height / 2} rx={object.width / 2} ry={object.height / 2} /> : <rect x={object.x} y={object.y} width={object.width} height={object.height} rx={object.frameShape === "rounded" ? Math.min(object.width, object.height) * .12 : object.cornerRadius} />}</clipPath>;
}
function textX(object: DesignObject) { return object.x + (object.textAlign === "center" ? object.width / 2 : object.textAlign === "right" ? object.width : 0); }
function applyTextTransform(value: string, transform?: DesignObject["textTransform"]) { return transform === "uppercase" ? value.toUpperCase() : transform === "lowercase" ? value.toLowerCase() : transform === "capitalize" ? value.replace(/\b\w/g, (letter) => letter.toUpperCase()) : value; }
function objectFilter(object: DesignObject) {
  const a = object.adjustments, f = object.filters;
  const brightness = Math.max(.1, 1 + a.brightness + a.exposure * .12 + a.whites * .08 + a.shadows * .05);
  const saturation = Math.max(0, a.saturation + a.vibrance * .25);
  const filters = [`brightness(${brightness})`, `contrast(${Math.max(.1, a.contrast + a.highlights * .1 - a.blacks * .05)})`, `saturate(${saturation})`, `hue-rotate(${a.tint * 18 - a.temperature * 10}deg)`, `blur(${f.blur * 18}px)`, `grayscale(${f.grayscale})`, `sepia(${f.sepia})`];
  if (f.glow) filters.push(`drop-shadow(0 0 ${f.glow * 24}px ${object.fill})`);
  if (object.shadowBlur) filters.push(`drop-shadow(${object.shadowX ?? 0}px ${object.shadowY ?? 8}px ${object.shadowBlur}px ${object.shadowColor ?? "#000000"})`);
  return filters.join(" ");
}
function starPoints(object: DesignObject) { const cx=object.x+object.width/2,cy=object.y+object.height/2,outer=Math.min(object.width,object.height)/2,inner=outer*.45; return Array.from({length:10},(_,i)=>{const r=i%2?inner:outer,a=-Math.PI/2+i*Math.PI/5;return (cx+Math.cos(a)*r)+","+(cy+Math.sin(a)*r)}).join(" "); }
function arrowPath(object: DesignObject) { const x=object.x,y=object.y,w=object.width,h=object.height; return `M ${x} ${y+h*.35} H ${x+w*.62} V ${y} L ${x+w} ${y+h/2} L ${x+w*.62} ${y+h} V ${y+h*.65} H ${x} Z`; }
