import { validateAuthorization as validate0 } from '../aircraft-grounding/policy'
import { validateAuthorization as validate1 } from '../maintenance-window/policy'
import { validateAuthorization as validate2 } from '../component-life/policy'
import { validateAuthorization as validate3 } from '../inspection-release/policy'
import { validateAuthorization as validate4 } from '../flight-assignment/policy'
import { validateAuthorization as validate5 } from '../deferred-defect/policy'
import { validateAuthorization as validate6 } from '../parts-rotable/policy'
import { validateAuthorization as validate7 } from '../return-to-service/policy'
import type { Entity, Field, Operation, Product } from '../workspace/types'
import { entity, number, requireThat, text } from '../workspace/values'
const roles=["Fleet Controller","Maintenance Control Engineer","Licensed Technician","Airworthiness Manager"] as const
const textField=(key:string,label:string):Field=>({key,label,type:'text',required:true,initial:'Evidence pending'})
const numberField=(key:string,label:string,initial:number):Field=>({key,label,type:'number',required:true,integer:true,min:0,max:1000000000,initial})
const dateField=(key:string,label:string):Field=>({key,label,type:'date',required:true,initial:'2026-09-14'})
type Validator=(record:{measured:number;limit:number;evidence:string;revision:number})=>unknown
function workflowOperations(kind:string,label:string,validate:Validator):Operation[]{return[
  {key:kind+'-submit',label:'Submit '+label,kind,from:['draft'],roles:[roles[0]],run:({entity})=>{entity.status='review';return label+' submitted for independent review.'}},
  {key:kind+'-authorize',label:'Authorize '+label,kind,from:['review'],roles:[roles[1]],run:({entity})=>{validate({measured:number(entity.fields,'measured'),limit:number(entity.fields,'limit'),evidence:text(entity.fields,'evidence'),revision:entity.revision});entity.status='authorized';return label+' authorized against current evidence and limits.'}},
  {key:kind+'-execute',label:'Execute '+label,kind,from:['authorized'],roles:[roles[2]],run:({entity,now})=>{requireThat(text(entity.fields,'effectiveDate')<=now.slice(0,10),'The effective date has not arrived.');entity.status='active';return label+' executed with operational custody recorded.'}},
  {key:kind+'-block',label:'Block '+label,kind,from:['authorized','active'],roles:[roles[0],roles[2]],fields:[textField('reason','Blocking reason')],run:({entity,input})=>{requireThat(text(input,'reason').trim().length>=8,'A specific blocking reason is required.');entity.status='blocked';return label+' blocked without losing prior evidence.'}},
  {key:kind+'-recover',label:'Recover '+label,kind,from:['blocked'],roles:[roles[1]],fields:[textField('recovery','Recovery evidence')],run:({entity,input})=>{requireThat(text(input,'recovery').trim().length>=8,'Recovery evidence is required.');entity.status='review';return label+' returned to review with recovery evidence.'}},
  {key:kind+'-close',label:'Close '+label,kind,from:['active'],roles:[roles[3]],run:({entity})=>{entity.status='closed';return label+' closed by accountable authority.'}},
]}
const kinds=[{
    key:"aircraft-grounding", label:"Aircraft grounding", states:['draft','review','authorized','active','blocked','closed'], initial:'draft', editors:[roles[0]],
    fields:[textField('owner','Accountable owner'), numberField('measured',"Telemetry age (minutes)",6), numberField('limit',"Maximum telemetry age",8), textField('evidence','Evidence reference'), dateField('effectiveDate','Effective date')]
  },
{
    key:"maintenance-window", label:"Maintenance windows", states:['draft','review','authorized','active','blocked','closed'], initial:'draft', editors:[roles[0]],
    fields:[textField('owner','Accountable owner'), numberField('measured',"Window start day",4), numberField('limit',"Required completion day",5), textField('evidence','Evidence reference'), dateField('effectiveDate','Effective date')]
  },
{
    key:"component-life", label:"Component life limits", states:['draft','review','authorized','active','blocked','closed'], initial:'draft', editors:[roles[0]],
    fields:[textField('owner','Accountable owner'), numberField('measured',"Remaining cycles",6), numberField('limit',"Minimum dispatch reserve",8), textField('evidence','Evidence reference'), dateField('effectiveDate','Effective date')]
  },
{
    key:"inspection-release", label:"Inspection release", states:['draft','review','authorized','active','blocked','closed'], initial:'draft', editors:[roles[0]],
    fields:[textField('owner','Accountable owner'), numberField('measured',"Inspector authorization score",4), numberField('limit',"Minimum authorization score",5), textField('evidence','Evidence reference'), dateField('effectiveDate','Effective date')]
  },
{
    key:"flight-assignment", label:"Flight assignment conflicts", states:['draft','review','authorized','active','blocked','closed'], initial:'draft', editors:[roles[0]],
    fields:[textField('owner','Accountable owner'), numberField('measured',"Required flight hours",6), numberField('limit',"Available aircraft hours",8), textField('evidence','Evidence reference'), dateField('effectiveDate','Effective date')]
  },
{
    key:"deferred-defect", label:"Deferred defect control", states:['draft','review','authorized','active','blocked','closed'], initial:'draft', editors:[roles[0]],
    fields:[textField('owner','Accountable owner'), numberField('measured',"Defect severity",4), numberField('limit',"Maximum deferrable severity",5), textField('evidence','Evidence reference'), dateField('effectiveDate','Effective date')]
  },
{
    key:"parts-rotable", label:"Rotable component custody", states:['draft','review','authorized','active','blocked','closed'], initial:'draft', editors:[roles[0]],
    fields:[textField('owner','Accountable owner'), numberField('measured',"Completed custody step",6), numberField('limit',"Required custody step",8), textField('evidence','Evidence reference'), dateField('effectiveDate','Effective date')]
  },
{
    key:"return-to-service", label:"Return to service", states:['draft','review','authorized','active','blocked','closed'], initial:'draft', editors:[roles[0]],
    fields:[textField('owner','Accountable owner'), numberField('measured',"Technical-record revision",4), numberField('limit',"Approved record revision",5), textField('evidence','Evidence reference'), dateField('effectiveDate','Effective date')]
  }]
const operations:Operation[]=[...workflowOperations("aircraft-grounding", "Aircraft grounding", validate0),
...workflowOperations("maintenance-window", "Maintenance windows", validate1),
...workflowOperations("component-life", "Component life limits", validate2),
...workflowOperations("inspection-release", "Inspection release", validate3),
...workflowOperations("flight-assignment", "Flight assignment conflicts", validate4),
...workflowOperations("deferred-defect", "Deferred defect control", validate5),
...workflowOperations("parts-rotable", "Rotable component custody", validate6),
...workflowOperations("return-to-service", "Return to service", validate7)]
const seed:Entity[]=[entity("aircraft-grounding-001","aircraft-grounding","Aircraft grounding primary record",'review',{owner:"Fleet Controller",measured:4,limit:8,evidence:"EV-AEROFLEET-001",effectiveDate:'2026-09-14'}),
entity("aircraft-grounding-002","aircraft-grounding","Aircraft grounding recovery record",'blocked',{owner:"Licensed Technician",measured:4,limit:8,evidence:"REC-AEROFLEET-001",effectiveDate:'2026-09-15'}),
entity("maintenance-window-001","maintenance-window","Maintenance windows primary record",'review',{owner:"Fleet Controller",measured:4,limit:8,evidence:"EV-AEROFLEET-002",effectiveDate:'2026-09-14'}),
entity("maintenance-window-002","maintenance-window","Maintenance windows recovery record",'blocked',{owner:"Licensed Technician",measured:4,limit:8,evidence:"REC-AEROFLEET-002",effectiveDate:'2026-09-15'}),
entity("component-life-001","component-life","Component life limits primary record",'review',{owner:"Fleet Controller",measured:8,limit:5,evidence:"EV-AEROFLEET-003",effectiveDate:'2026-09-14'}),
entity("component-life-002","component-life","Component life limits recovery record",'blocked',{owner:"Licensed Technician",measured:8,limit:5,evidence:"REC-AEROFLEET-003",effectiveDate:'2026-09-15'}),
entity("inspection-release-001","inspection-release","Inspection release primary record",'review',{owner:"Fleet Controller",measured:8,limit:5,evidence:"EV-AEROFLEET-004",effectiveDate:'2026-09-14'}),
entity("inspection-release-002","inspection-release","Inspection release recovery record",'blocked',{owner:"Licensed Technician",measured:8,limit:5,evidence:"REC-AEROFLEET-004",effectiveDate:'2026-09-15'}),
entity("flight-assignment-001","flight-assignment","Flight assignment conflicts primary record",'review',{owner:"Fleet Controller",measured:4,limit:8,evidence:"EV-AEROFLEET-005",effectiveDate:'2026-09-14'}),
entity("flight-assignment-002","flight-assignment","Flight assignment conflicts recovery record",'blocked',{owner:"Licensed Technician",measured:4,limit:8,evidence:"REC-AEROFLEET-005",effectiveDate:'2026-09-15'}),
entity("deferred-defect-001","deferred-defect","Deferred defect control primary record",'review',{owner:"Fleet Controller",measured:4,limit:8,evidence:"EV-AEROFLEET-006",effectiveDate:'2026-09-14'}),
entity("deferred-defect-002","deferred-defect","Deferred defect control recovery record",'blocked',{owner:"Licensed Technician",measured:4,limit:8,evidence:"REC-AEROFLEET-006",effectiveDate:'2026-09-15'}),
entity("parts-rotable-001","parts-rotable","Rotable component custody primary record",'review',{owner:"Fleet Controller",measured:8,limit:5,evidence:"EV-AEROFLEET-007",effectiveDate:'2026-09-14'}),
entity("parts-rotable-002","parts-rotable","Rotable component custody recovery record",'blocked',{owner:"Licensed Technician",measured:8,limit:5,evidence:"REC-AEROFLEET-007",effectiveDate:'2026-09-15'}),
entity("return-to-service-001","return-to-service","Return to service primary record",'review',{owner:"Fleet Controller",measured:5,limit:5,evidence:"EV-AEROFLEET-008",effectiveDate:'2026-09-14'}),
entity("return-to-service-002","return-to-service","Return to service recovery record",'blocked',{owner:"Licensed Technician",measured:5,limit:5,evidence:"REC-AEROFLEET-008",effectiveDate:'2026-09-15'})]
export const product:Product={name:"AeroFleet",description:"Airline fleet operations and aircraft maintenance",accent:"#176B87",actors:roles.map((role,index)=>({id:'actor-'+String(index),name:role,role})),kinds,operations,seed,
 validate:(entities)=>{for(const row of entities){requireThat(kinds.some(kind=>kind.key===row.kind),'Unknown domain record.');requireThat(typeof row.fields['owner']==='string','Every workflow requires accountable ownership.')}},
 metrics:(entities)=>[{label:'Domain records',value:String(entities.length)},{label:'Active controls',value:String(entities.filter(row=>['review','authorized','active','blocked'].includes(row.status)).length)},{label:'Blocked',value:String(entities.filter(row=>row.status==='blocked').length)},{label:'Closed',value:String(entities.filter(row=>row.status==='closed').length)}]}
