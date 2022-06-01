import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { interval, Observable, of, timer } from 'rxjs';
import { Barricade, Base, MonocleEvent, Player, PlayerId, PlayerMessage, SelectedEntity, SelectedEntityType, ServerInfo, Structure, Vehicle } from '../types/models';
import { AuthenticationRequest } from '../types/requests';
import { WebsocketService } from '../services/websocket.service';
import * as _ from 'lodash';
import { AuthorizedUserType } from '../types/enums';
import { SuccesfulAuthenticationResponse } from '../types/responses';

@Component({
  selector: 'app-server-dashboard',
  templateUrl: './server-dashboard.component.html',
  styleUrls: ['./server-dashboard.component.scss'],
  providers: [WebsocketService]
})
export class ServerDashboardComponent implements OnInit {
  loggedIn: boolean = false;
  players?: Player[];
  barricades?: Barricade[];
  structures?: Structure[];
  vehicles?: Vehicle[];
  bases: Base[];
  authenticationData?: SuccesfulAuthenticationResponse;
  serverInfo?: ServerInfo;
  chatLog: PlayerMessage[];
  eventLog: MonocleEvent[];
  selectedEntity?: SelectedEntity<PlayerId | string>;
  selectedEntityType = SelectedEntityType; // used in ngSwitch
  imagePath?: string;

  connectAndLogin(request: AuthenticationRequest) {
    this.websocketService.connect(request.host, request.port, request.ssl);
    setTimeout(() => {
      this.websocketService.login(request.username, request.password);
    }, 500);
  }

  constructor(private websocketService: WebsocketService) {
    this.chatLog = [];
    this.eventLog = [];
    this.bases = [];
  }

  ngOnInit(): void {
    // TODO: These should probably be inside the constructor

    this.websocketService.onLoginSuccessful.subscribe(authData => {
      this.loggedIn = true;
      this.authenticationData = authData;
      this.bindRequests();
    })

    this.websocketService.onGetPlayers.subscribe(players => {
      this.players = players;
    })

    this.websocketService.onGetBarricades.subscribe(barricades => {
      this.barricades = barricades;
    })

    this.websocketService.onGetStructures.subscribe(structures => {
      this.structures = structures;
    })

    this.websocketService.onGetVehicles.subscribe(vehicles => {
      this.vehicles = vehicles;
    })

    this.websocketService.onGetServerInfo.subscribe(serverDetails => {
      this.serverInfo = serverDetails;
    })

    this.websocketService.onPlayerMessage.subscribe(playerMessage => {
      this.chatLog = [playerMessage, ...this.chatLog];
    })

    this.websocketService.internalServerError.subscribe(error => {
      console.error(error.message, error.code, error.stackTrace);
    })

    this.websocketService.userNotFound.subscribe(error => {
      console.error(`User with id ${error.userId} was not found`);
    })

    this.websocketService.onGetPlayerScreenshot.subscribe(screenshotResponse => {
      this.imagePath = 'data:image/jpg;base64,' + screenshotResponse.screenEncoded;
    })

    this.websocketService.onPlayerLeft.subscribe(leftEvent => {
      let message = `${leftEvent.player.name} left`;
      let event = this.buildEvent(leftEvent.time, message);
      this.eventLog = [event, ...this.eventLog];
    })

    this.websocketService.onPlayerJoin.subscribe(joinEvent => {
      let message = `${joinEvent.player.name} joined`;
      let event = this.buildEvent(joinEvent.time, message);
      this.eventLog = [event, ...this.eventLog];
    })

    this.websocketService.onPlayerDeath.subscribe(deathEvent => {
      let message;
      if (!deathEvent.killer) {
        message = `${deathEvent.dead.name} died! [${deathEvent.cause}]`
      } else {
        message = `${deathEvent.killer.name} killed ${deathEvent.dead.name} - [${deathEvent.cause}]`
      }

      let event = this.buildEvent(deathEvent.time, message);
      this.eventLog = [event, ...this.eventLog];
    })
  }

  watchPlayer(id: PlayerId) {
    this.getPlayerScreenshot(id);
  }

  clearImage() {
    this.imagePath = undefined;
  }

  bindRequests() {
    // TODO: Find more elegant approach to these
    this.getPlayers();
    const playerFetchInterval = interval(1000);
    playerFetchInterval.subscribe(() => this.getPlayers())

    this.getVehicles()
    const vehicleFetchInterval = interval(5_000);
    vehicleFetchInterval.subscribe(() => this.getVehicles())

    this.getBarricades();
    const barricadesFetchInterval = interval(60_000);
    barricadesFetchInterval.subscribe(() => this.getBarricades())

    this.getStructures();
    const structuresFetchInterval = interval(60_000);
    structuresFetchInterval.subscribe(() => this.getStructures())

    setTimeout(() => {
      this.findBases()
    }, 1000)
    const findBasesInterval = interval(60_000);
    findBasesInterval.subscribe(() => this.findBases())

    // TODO: Find more elegant approach to these
    this.getServerDetails();
    const serverDetailsFetchInterval = interval(60_000);
    serverDetailsFetchInterval.subscribe(() => this.getServerDetails())
  }

  findBases() {
    if (this.barricades && this.structures) {
      let groupedBarricades = _.groupBy(this.barricades, ({ groupId }) => groupId);
      let groupedStructures = _.groupBy(this.structures, ({ groupId }) => groupId);

      let bases: { [key: string]: Base } = {};
      let baseBarricades: { [key: string]: number } = {};

      for (let [groupId, barricades] of Object.entries(groupedBarricades)) {
        if (groupId == '0' || barricades.length < 4) {
          continue;
        }

        bases[groupId] = {
          groupId,
          barricades,
          position: { x: 0, y: 0, z: 0 },
          structures: [],
        };

        for (let barricade of barricades) {
          let pos = barricade.position;
          var base = bases[groupId];
          base.position.x += pos.x;
          base.position.y += pos.y;
          base.position.z += pos.z;
        }

        baseBarricades[groupId] = barricades.length;
      }

      for (let [groupId, structures] of Object.entries(groupedStructures)) {
        if (structures.length < 5) {
          continue;
        }

        var base = bases[groupId];

        if (!base) {
          // Ignore groups that only put structres
          continue;
        }

        for (let structure of structures) {
          let pos = structure.position;

          base.position.x += pos.x;
          base.position.y += pos.y;
          base.position.z += pos.z;
        }

        let totalStructuresAndBarricades = baseBarricades[groupId];
        totalStructuresAndBarricades += structures.length;
        base.structures = structures;
        base.position.x /= totalStructuresAndBarricades;
        base.position.y /= totalStructuresAndBarricades;
        base.position.z /= totalStructuresAndBarricades;
      }

      this.bases = Object.values(bases);
    }
  }

  buildEvent(time: Date, message: string): MonocleEvent {
    return { time, message }
  }

  vehicleSelected(id: string) {
    this.selectedEntity = { type: SelectedEntityType.Vehicle, id }
  }

  baseSelected(id: string) {
    this.selectedEntity = { type: SelectedEntityType.Base, id }
  }

  playerSelected(id: PlayerId) {
    this.selectedEntity = { type: SelectedEntityType.Player, id }
  }

  getSelectedPlayer(): Player | undefined {
    if (this.selectedEntity?.type == SelectedEntityType.Player) {
      let id = this.selectedEntity.id;
      return this.players?.find(p => p.id == id);
    }
    return;
  }

  getSelectedBase(): Base | undefined {
    if (this.selectedEntity?.type == SelectedEntityType.Base) {
      let id = this.selectedEntity.id;
      return this.bases?.find(p => p.groupId == id);
    }
    return;
  }

  getSelectedVehicle(): Vehicle | undefined {
    if (this.selectedEntity?.type == SelectedEntityType.Vehicle) {
      let id = this.selectedEntity.id;
      return this.vehicles?.find(p => p.instanceId == id);
    }
    return;
  }

  userCanModerate(): boolean {
    return this.authenticationData?.userType == AuthorizedUserType.Administrator;
  }

  getPlayers() { this.websocketService.getPlayers(); }
  getPlayerScreenshot(id: PlayerId) { this.websocketService.getPlayerScreenshot(id); }
  getVehicles() { this.websocketService.getVehicles(); }
  getStructures() { this.websocketService.getStructures(); }
  getBarricades() { this.websocketService.getBarricades(); }
  getServerDetails() { this.websocketService.getServerDetails(); }
}
