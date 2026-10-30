import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { isUniqueViolation } from '../database/pg-errors.js';
import { Area } from '../entities/area.entity.js';
import type { CreateAreaDto } from './dto/create-area.dto.js';

@Injectable()
export class AreasService {
  constructor(
    @InjectRepository(Area) private readonly areas: Repository<Area>,
  ) {}

  async create(createAreaDto: CreateAreaDto): Promise<Area> {
    //Aynı satırlardaki geometry(Polygon, 4326) kolon tipi de iki şeyi garanti ediyor. 
    //Kolona sadece Polygon tipi yazılabiliyor ve SRID 4326 (WGS84 lat/lng) olmak zorunda.
    await this.assertValidGeometry(createAreaDto.polygon);
    try {
      return await this.areas.save(
        this.areas.create({
          name: createAreaDto.name,
          polygon: {
            type: 'Polygon',
            coordinates: createAreaDto.polygon.coordinates,
          },
        }),
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          `Area name "${createAreaDto.name}" already exists`,
        );
      }
      throw error;
    }
  }

  findAll(): Promise<Area[]> {
    return this.areas.find({ order: { id: 'ASC' } });
  }

  // Rejects self-intersecting rings, holes outside the shell, etc. with the
  // reason PostGIS reports, instead of failing on the table's CHECK constraint.
  private async assertValidGeometry(
    polygon: CreateAreaDto['polygon'],
  ): Promise<void> {
    const [result] = await this.areas.query<
      { valid: boolean; reason: string }[]
    >(
      `SELECT ST_IsValid(g) AS valid, ST_IsValidReason(g) AS reason
       FROM ST_GeomFromGeoJSON($1) AS g`,
      [JSON.stringify(polygon)],
    );
    if (!result.valid) {
      throw new BadRequestException(`Invalid polygon: ${result.reason}`);
    }
  }
}
