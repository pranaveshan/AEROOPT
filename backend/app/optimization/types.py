"""Solver-domain contracts; independent from HTTP, persistence, and UI."""
from dataclasses import dataclass, field
from typing import Literal

@dataclass(frozen=True)
class Aircraft:
    id: str
    capabilities: frozenset[str]
    serviceable: bool = True
    available_from: int = 0
    available_until: int = 1440
    max_flight_minutes: int = 600
    used_flight_minutes: int = 0
    turnaround_minutes: int = 30
    maintenance: tuple[tuple[int, int], ...] = ()

@dataclass(frozen=True)
class Crew:
    id: str
    qualifications: frozenset[str]
    available_from: int = 0
    available_until: int = 1440
    max_duty_minutes: int = 600
    used_duty_minutes: int = 0
    min_rest_minutes: int = 30
    qualification_expiry: tuple[tuple[str, int], ...] = ()

@dataclass(frozen=True)
class Task:
    id: str
    category: str
    priority: int
    release: int
    earliest_start: int
    latest_finish: int
    duration: int
    capabilities: frozenset[str] = frozenset()
    qualifications: frozenset[str] = frozenset()
    status: str = "pending"
    dependencies: tuple[str, ...] = ()
    support_units: int = 0
    previous_aircraft_id: str | None = None

@dataclass(frozen=True)
class PlanningInput:
    aircraft: tuple[Aircraft, ...]
    crew: tuple[Crew, ...]
    tasks: tuple[Task, ...]
    support_capacity: int = 2
    weather_restrictions: tuple[tuple[int, int], ...] = ()
    horizon_minutes: int = 1440
    stability_weight: int = 0
    seed: int = 42
    require_complete_coverage: bool = False

@dataclass(frozen=True)
class Assignment:
    task_id: str
    aircraft_id: str
    crew_id: str
    start: int
    finish: int
    explanation: tuple[str, ...] = ()

@dataclass
class SolveResult:
    status: Literal["OPTIMAL", "FEASIBLE", "INFEASIBLE", "UNKNOWN", "MODEL_INVALID"]
    assignments: list[Assignment] = field(default_factory=list)
    unassigned: dict[str, list[str]] = field(default_factory=dict)
    objective_components: dict[str, float] = field(default_factory=dict)
    objective: float | None = None
    best_bound: float | None = None
    wall_time_seconds: float = 0.0
    solver: str = "unknown"
    input_hash: str = ""
    validation: dict = field(default_factory=dict)
