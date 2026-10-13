import hashlib, json
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from ..models import AuditRow

def _digest(body: dict) -> str:
    return hashlib.sha256(json.dumps(body,sort_keys=True,separators=(",",":"),ensure_ascii=False).encode()).hexdigest()

def append_event(db: Session, action: str, entity_id: str, payload: dict, actor: str="demo-user"):
    prev=db.query(AuditRow).order_by(AuditRow.id.desc()).first()
    previous=prev.event_hash if prev else "GENESIS"
    timestamp=datetime.now(timezone.utc).isoformat()
    envelope={"timestamp":timestamp,"data":payload}
    body={"created_at":timestamp,"actor":actor,"action":action,"entity_id":entity_id,"payload":envelope,"previous_hash":previous}
    digest=_digest(body)
    row=AuditRow(actor=actor,action=action,entity_id=entity_id,payload=json.dumps(envelope,sort_keys=True),previous_hash=previous,event_hash=digest)
    db.add(row); db.flush(); return row

def verify_chain(db: Session):
    previous="GENESIS"
    rows=db.query(AuditRow).order_by(AuditRow.id.asc()).all()
    for row in rows:
        if row.previous_hash != previous: return {"valid":False,"first_broken_event_id":row.id,"reason":"PREVIOUS_HASH_MISMATCH","events_checked":row.id-1}
        try: envelope=json.loads(row.payload); timestamp=envelope["timestamp"]
        except Exception: return {"valid":False,"first_broken_event_id":row.id,"reason":"PAYLOAD_MALFORMED","events_checked":row.id-1}
        body={"created_at":timestamp,"actor":row.actor,"action":row.action,"entity_id":row.entity_id,"payload":envelope,"previous_hash":row.previous_hash}
        if _digest(body) != row.event_hash: return {"valid":False,"first_broken_event_id":row.id,"reason":"EVENT_HASH_MISMATCH","events_checked":row.id-1}
        previous=row.event_hash
    return {"valid":True,"events_checked":len(rows)}
