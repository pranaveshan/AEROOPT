from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.db import Base
from app.services.audit import append_event,verify_chain
from app.models import AuditRow

def test_audit_chain_and_tamper_detection():
    engine=create_engine('sqlite:///:memory:'); Base.metadata.create_all(engine); Session=sessionmaker(bind=engine)
    with Session() as db:
        append_event(db,'TEST','T-1',{'value':1}); append_event(db,'TEST','T-2',{'value':2}); db.commit()
        assert verify_chain(db)['valid']
        row=db.query(AuditRow).filter_by(id=1).one(); row.payload='{"tampered":true}'; db.commit()
        report=verify_chain(db); assert not report['valid']; assert report['first_broken_event_id']==1
