from datetime import datetime, timezone
from sqlalchemy import String, Integer, Boolean, DateTime, Text, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column
from .db import Base

def now(): return datetime.now(timezone.utc)
class AircraftRow(Base):
    __tablename__="aircraft"
    id: Mapped[str]=mapped_column(String,primary_key=True)
    type: Mapped[str]=mapped_column(String,nullable=False)
    capabilities: Mapped[str]=mapped_column(Text,default="[]")
    home_facility: Mapped[str]=mapped_column(String,default="NORTH FIELD")
    status: Mapped[str]=mapped_column(String,default="serviceable")
    available_from: Mapped[int]=mapped_column(Integer,default=0)
    available_until: Mapped[int]=mapped_column(Integer,default=1440)
    max_flight_minutes: Mapped[int]=mapped_column(Integer,default=600)
    used_flight_minutes: Mapped[int]=mapped_column(Integer,default=0)
    turnaround_minutes: Mapped[int]=mapped_column(Integer,default=30)
    maintenance: Mapped[str]=mapped_column(Text,default="[]")
    archived: Mapped[bool]=mapped_column(Boolean,default=False)
class PersonnelRow(Base):
    __tablename__="personnel"
    id: Mapped[str]=mapped_column(String,primary_key=True)
    role: Mapped[str]=mapped_column(String,default="Operator")
    qualifications: Mapped[str]=mapped_column(Text,default="[]")
    qualification_expiry: Mapped[str]=mapped_column(Text,default="{}")
    available_from: Mapped[int]=mapped_column(Integer,default=0)
    available_until: Mapped[int]=mapped_column(Integer,default=1440)
    max_duty_minutes: Mapped[int]=mapped_column(Integer,default=600)
    used_duty_minutes: Mapped[int]=mapped_column(Integer,default=0)
    min_rest_minutes: Mapped[int]=mapped_column(Integer,default=30)
    archived: Mapped[bool]=mapped_column(Boolean,default=False)
class TaskRow(Base):
    __tablename__="tasks"
    id: Mapped[str]=mapped_column(String,primary_key=True)
    title: Mapped[str]=mapped_column(String,nullable=False)
    category: Mapped[str]=mapped_column(String,default="Training and evaluation")
    priority: Mapped[int]=mapped_column(Integer,default=3)
    release: Mapped[int]=mapped_column(Integer,default=0)
    earliest_start: Mapped[int]=mapped_column(Integer,default=0)
    latest_finish: Mapped[int]=mapped_column(Integer,default=1440)
    duration: Mapped[int]=mapped_column(Integer,default=60)
    capabilities: Mapped[str]=mapped_column(Text,default="[]")
    qualifications: Mapped[str]=mapped_column(Text,default="[]")
    dependencies: Mapped[str]=mapped_column(Text,default="[]")
    support_units: Mapped[int]=mapped_column(Integer,default=1)
    status: Mapped[str]=mapped_column(String,default="pending")
    previous_aircraft_id: Mapped[str|None]=mapped_column(String,nullable=True)
    archived: Mapped[bool]=mapped_column(Boolean,default=False)
class AssignmentRow(Base):
    __tablename__="assignments"
    id: Mapped[int]=mapped_column(Integer,primary_key=True,autoincrement=True)
    schedule_version: Mapped[str]=mapped_column(String,index=True)
    task_id: Mapped[str]=mapped_column(String,index=True)
    aircraft_id: Mapped[str]=mapped_column(String)
    crew_id: Mapped[str]=mapped_column(String)
    start: Mapped[int]=mapped_column(Integer)
    finish: Mapped[int]=mapped_column(Integer)
    explanation: Mapped[str]=mapped_column(Text,default="[]")
class SolverRunRow(Base):
    __tablename__="solver_runs"
    id: Mapped[str]=mapped_column(String,primary_key=True)
    created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True),default=now)
    solver: Mapped[str]=mapped_column(String)
    status: Mapped[str]=mapped_column(String)
    duration_seconds: Mapped[float]=mapped_column()
    input_hash: Mapped[str]=mapped_column(String)
    output_hash: Mapped[str]=mapped_column(String)
    result_json: Mapped[str]=mapped_column(Text)
class AuditRow(Base):
    __tablename__="audit_events"
    id: Mapped[int]=mapped_column(Integer,primary_key=True,autoincrement=True)
    created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True),default=now)
    actor: Mapped[str]=mapped_column(String,default="demo-user")
    action: Mapped[str]=mapped_column(String)
    entity_id: Mapped[str]=mapped_column(String)
    payload: Mapped[str]=mapped_column(Text)
    previous_hash: Mapped[str]=mapped_column(String)
    event_hash: Mapped[str]=mapped_column(String,unique=True)
class ScenarioRow(Base):
    __tablename__="scenarios"
    id: Mapped[str]=mapped_column(String,primary_key=True)
    name: Mapped[str]=mapped_column(String,nullable=False)
    status: Mapped[str]=mapped_column(String,default="draft")
    version: Mapped[int]=mapped_column(Integer,default=1)
    snapshot_json: Mapped[str]=mapped_column(Text,default="{}")
    result_json: Mapped[str]=mapped_column(Text,nullable=True)
    baseline_hash: Mapped[str]=mapped_column(String,default="")
    created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True),default=now)
    updated_at: Mapped[datetime]=mapped_column(DateTime(timezone=True),default=now)
Index("ix_task_status_deadline","tasks","status","latest_finish")
