import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { CdkDrag, CdkDropList, CdkDragDrop, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';

import { Subscription } from "rxjs";

import { GameService } from '../game.service';
import { SnarkService } from '../snark.service';
import { LogService } from '../log.service';
import { Cell, CellState } from '../cell';
import { Ship, ShipOrientation, ShipState } from '../ship';

@Component({
  selector: 'app-board',
  templateUrl: './board.component.html',
  styleUrls: ['./board.component.css']
})

export class BoardComponent implements OnInit, OnDestroy {
  board: Cell[][];
  turn: number;
  @Input() contractAddress: string;
  @Input() verifyMethod: string = "JavaScript";
  private readonly sub: Subscription = new Subscription();

  // worker callbacks
  private readonly _cbIsValid = data => {
        console.log("isValid$");
        console.log(data);
        this.gameService.getCell(data.targetX, data.targetY).validate(data.isValid);
        this.logService.addMessage(`[${data.targetX}, ${data.targetY}]: proof verification result is '${data.isValid}'`);
      }
  private readonly _cbProofOutput = data => {
        console.log("proofOutput$");
        console.log(data);
        this.logService.addMessage(`[${data.targetX}, ${data.targetY}]: proof generated by local JavaScript`);

        let hitOrMissed: CellState = (data.fireResult == 1) ? CellState.Hit : CellState.Missed;
        // check if local hit/missed status is consistent with the circuit
        if (this.gameService.getCell(data.targetX, data.targetY).verify(hitOrMissed)) {
          if (this.verifyMethod === "JavaScript") {
            this.snarkService.verify(data.proof, data.fireResult, data.targetX, data.targetY);
            this.logService.addMessage(`[${data.targetX}, ${data.targetY}]: verifying the proof by local JavaScript...`);
          } else if (this.verifyMethod === "Web3") {
            this.snarkService.verifyByWeb3(data.proof, data.fireResult, data.targetX, data.targetY, this.contractAddress).subscribe(this._cbIsValid);
            this.logService.addMessage(`[${data.targetX}, ${data.targetY}]: verifying the proof by smart contract via Web3 at '${this.contractAddress}'...`);
          }
        }
        else {
          this.logService.addMessage(`[${data.targetX}, ${data.targetY}]: result failed to be locally verified`);
        }
      };

  constructor(
    private gameService: GameService,
    private snarkService: SnarkService,
    private logService: LogService,
    private router: Router
    ) {
  }

  ngOnInit() {
    if (this.gameService.isAllDeployed()) {
    	this.getBoardAndTurn();
      // TODO: make below async as it's generating the hash
      console.log(this.gameService.getShips());
      this.snarkService.commitShips(this.gameService.getShips());

      // subscribe proving / verification observables
      this.sub.add(this.snarkService.proofOutput$.subscribe(this._cbProofOutput));
      this.sub.add(this.snarkService.isValid$.subscribe(this._cbIsValid));
    }
    else {
      this.router.navigateByUrl('/setup');
    }
  }

  ngOnDestroy() {
    // unsubscribe all observables
    if (this.sub !== undefined) {
      this.sub.unsubscribe();
    }
  }

  getBoardAndTurn(): void {
  	this.board = this.gameService.getBoard();
  	this.turn = this.gameService.getTurn();
  }

  getShipByCell(cell: Cell) : Ship {
    return this.gameService.getShipByCell(cell);
  }

  onSelect(cell: Cell): void {
  	//window.alert(`A cell (${cell.x}, ${cell.y}) is selected!`);
  	if (this.gameService.fire(cell)) {
      this.logService.addMessage(`[${cell.x}, ${cell.y}]: generating proof...`);
      this.snarkService.fire(cell.x, cell.y);

      this.turn = this.gameService.getTurn();
    }
  }

  isDestroyedShipTypeEqual(ship: Ship, shipType: string) : boolean {
    return ship.state === ShipState.Destroyed && ship.constructor.name === shipType;  
  }
}
