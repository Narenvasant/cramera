"""
Requests the causal diagnosis plugin cannot serve.
"""

from __future__ import annotations

from dataclasses import dataclass
from http import HTTPStatus

from cramera.exceptions import ViewerError


@dataclass
class ExperimentFileNotFound(ViewerError):
    """
    A requested experiment document that does not exist.
    """

    requested: str
    """
    The path that was requested, below the experiments directory.
    """

    def status(self) -> HTTPStatus:
        return HTTPStatus.NOT_FOUND

    def message(self) -> str:
        return f"No experiment document {self.requested!r} has been written yet."


@dataclass
class ExperimentPathOutside(ViewerError):
    """
    A requested path that leads out of the experiments directory.
    """

    requested: str
    """
    The path that was requested.
    """

    def status(self) -> HTTPStatus:
        return HTTPStatus.FORBIDDEN

    def message(self) -> str:
        return f"{self.requested!r} leads out of the experiments directory."
