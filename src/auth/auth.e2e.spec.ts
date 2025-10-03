import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { Role } from '@prisma/client';
import { AppModule } from 'src/app.module';

describe('AuthController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let managerToken: string;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = app.get(PrismaService);
    await app.init();

    // cleanup db sebelum test
    await prisma.approval.deleteMany();
    await prisma.document.deleteMany();
    await prisma.contract.deleteMany();
    await prisma.user.deleteMany();

    // buat user manager untuk register user lain
    const passwordHash = await bcrypt.hash('password123', 10);
    const manager = await prisma.user.create({
      data: {
        email: 'manager@test.com',
        name: 'Manager Test',
        password: passwordHash,
        role: Role.Manager,
      },
    });

    // login manager untuk ambil accessToken
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'manager@test.com', password: 'password123' })
      .expect(200);

    managerToken = loginRes.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('should login successfully', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'manager@test.com', password: 'password123' })
      .expect(200);

    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
    expect(res.body.user.email).toBe('manager@test.com');
  });

  it('should register a new user by manager', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        email: 'vendor@test.com',
        name: 'Vendor User',
        password: 'password123',
        role: Role.Vendor,
      })
      .expect(201);

    expect(res.body.message).toBe('User registered successfully');
    expect(res.body.user.email).toBe('vendor@test.com');
  });

  it('should fail register with duplicate email', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        email: 'vendor@test.com',
        name: 'Vendor User',
        password: 'password123',
        role: Role.Vendor,
      })
      .expect(400);
  });

  it('should login as vendor', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'vendor@test.com', password: 'password123' })
      .expect(200);

    expect(res.body.user.role).toBe('Vendor');
  });

  it('should refresh token', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'vendor@test.com', password: 'password123' })
      .expect(200);

    const res = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: loginRes.body.refreshToken })
      .expect(200);

    expect(res.body).toHaveProperty('accessToken');
  });

  it('should get account info', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'vendor@test.com', password: 'password123' })
      .expect(200);

    const res = await request(app.getHttpServer())
      .get('/auth/account')
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
      .expect(200);

    expect(res.body.user.email).toBe('vendor@test.com');
  });

  it('should logout successfully', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'vendor@test.com', password: 'password123' })
      .expect(200);

    const res = await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
      .expect(200);

    expect(res.body.message).toBe('Logout successful');
  });
});
